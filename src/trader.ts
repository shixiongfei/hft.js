/*
 * trader.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import Denque from "denque";
import ctp from "napi-ctp";
import { CTPProvider, UserInfo } from "./provider.js";
import {
  CommissionRate,
  InstrumentData,
  MarginRate,
  OffsetType,
  OrderData,
  OrderFlag,
  OrderStatus,
  ProductType,
  SideType,
  TradeData,
} from "./typedef.js";
import {
  ICommissionRateReceiver,
  IInstrumentReceiver,
  IInstrumentsReceiver,
  ILifecycleListener,
  IMarginRateReceiver,
  IOrderReceiver,
  IOrdersReceiver,
  IPositionsReceiver,
  ITraderProvider,
  ITradingAccountsReceiver,
} from "./interfaces.js";

type MarginRateQuery = { symbol: string; receiver: IMarginRateReceiver };

type CommissionRateQuery = {
  symbol: string;
  receiver: ICommissionRateReceiver;
};

export class Trader extends CTPProvider implements ITraderProvider {
  private traderApi?: ctp.Trader;
  private tradingDay: number;
  private frontId: number;
  private sessionId: number;
  private orderRef: number;
  private readonly receivers: IOrderReceiver[];
  private readonly instruments: ctp.InstrumentField[];
  private readonly orders: Map<string, ctp.OrderField>;
  private readonly trades: Map<string, ctp.TradeField[]>;
  private readonly marginRates: Map<string, ctp.InstrumentMarginRateField>;
  private readonly commRates: Map<string, ctp.InstrumentCommissionRateField>;
  private readonly marginRatesQueue: Denque<MarginRateQuery>;
  private readonly commRatesQueue: Denque<CommissionRateQuery>;

  constructor(
    flowTdPath: string,
    frontTdAddrs: string | string[],
    userInfo: UserInfo,
  ) {
    super(flowTdPath, frontTdAddrs, userInfo);
    this.tradingDay = 0;
    this.frontId = 0;
    this.sessionId = 0;
    this.orderRef = 0;
    this.receivers = [];
    this.instruments = [];
    this.orders = new Map();
    this.trades = new Map();
    this.marginRates = new Map();
    this.commRates = new Map();
    this.marginRatesQueue = new Denque();
    this.commRatesQueue = new Denque();
  }

  open(lifecycle: ILifecycleListener) {
    if (this.traderApi) {
      return true;
    }

    this.traderApi = ctp.createTrader(this.flowPath, this.frontAddrs);

    this.traderApi.on(ctp.TraderEvent.FrontConnected, () => {
      this._withRetry(() => this.traderApi!.reqAuthenticate(this.userInfo));
    });

    this.traderApi.on<ctp.RspAuthenticateField>(
      ctp.TraderEvent.RspAuthenticate,
      (_, options) => {
        if (this._isErrorResp(lifecycle, options, "login-error")) {
          return;
        }

        this._withRetry(() => this.traderApi!.reqUserLogin(this.userInfo));
      },
    );

    this.traderApi.on<ctp.RspUserLoginField>(
      ctp.TraderEvent.RspUserLogin,
      (rspUserLogin, options) => {
        if (this._isErrorResp(lifecycle, options, "login-error")) {
          return;
        }

        this.frontId = rspUserLogin.FrontID;
        this.sessionId = rspUserLogin.SessionID;
        this.orderRef = parseInt(rspUserLogin.MaxOrderRef);

        const tradingDay = parseInt(this.traderApi!.getTradingDay());

        if (this.tradingDay !== tradingDay) {
          this.marginRates.clear();
          this.commRates.clear();
          this.tradingDay = tradingDay;
        }

        this._withRetry(() =>
          this.traderApi!.reqSettlementInfoConfirm(this.userInfo),
        );
      },
    );

    this.traderApi.on<ctp.SettlementInfoConfirmField>(
      ctp.TraderEvent.RspSettlementInfoConfirm,
      (_, options) => {
        if (this._isErrorResp(lifecycle, options, "login-error")) {
          return;
        }

        this.orders.clear();
        this._withRetry(() => this.traderApi!.reqQryOrder(this.userInfo));
      },
    );

    this.traderApi.on<ctp.OrderField>(
      ctp.TraderEvent.RspQryOrder,
      (order, options) => {
        if (this._isErrorResp(lifecycle, options, "query-order-error")) {
          return;
        }

        if (order) {
          const orderId = this._calcOrderId(order);
          this.orders.set(orderId, order);
        }

        if (options.isLast) {
          this.trades.clear();
          this._withRetry(() => this.traderApi!.reqQryTrade(this.userInfo));
        }
      },
    );

    this.traderApi.on<ctp.TradeField>(
      ctp.TraderEvent.RspQryTrade,
      (trade, options) => {
        if (this._isErrorResp(lifecycle, options, "query-trade-error")) {
          return;
        }

        if (trade) {
          const orderId = this._calcOrderId(trade);
          const trades = this.trades.get(orderId);

          if (trades) {
            trades.push(trade);
          } else {
            this.trades.set(orderId, [trade]);
          }
        }

        if (options.isLast) {
          this.instruments.splice(0, this.instruments.length);
          this._withRetry(() => this.traderApi!.reqQryInstrument());
        }
      },
    );

    let fired = false;

    this.traderApi.on<ctp.InstrumentField>(
      ctp.TraderEvent.RspQryInstrument,
      (instrument, options) => {
        if (this._isErrorResp(lifecycle, options, "query-instrument-error")) {
          return;
        }

        if (instrument) {
          if (
            instrument.ProductClass === ctp.ProductClassType.Futures ||
            instrument.ProductClass === ctp.ProductClassType.Options
          ) {
            this.instruments.push(instrument);
          }
        }

        if (options.isLast && !fired) {
          fired = true;
          lifecycle.onOpen();

          this._processMarginRatesQueue();
          this._processCommissionRatesQueue();
        }
      },
    );

    this.traderApi.on<ctp.OrderField>(ctp.TraderEvent.RtnOrder, (order) => {
      const orderId = this._calcOrderId(order);
      const current = this.orders.get(orderId);

      if (current) {
        if (
          order.OrderSubmitStatus === current.OrderSubmitStatus &&
          order.OrderStatus === current.OrderStatus
        ) {
          return;
        }
      }

      this.orders.set(orderId, order);

      switch (this._calcOrderStatus(order)) {
        case "submitted":
          {
            const orderData = this._toOrderData(order);
            this.receivers.forEach((receiver) => receiver.onEntrust(orderData));
          }
          break;

        case "canceled":
          {
            const orderData = this._toOrderData(order);
            this.receivers.forEach((receiver) => receiver.onCancel(orderData));
          }
          break;

        case "rejected":
          {
            const orderData = this._toOrderData(order);
            this.receivers.forEach((receiver) => receiver.onReject(orderData));
          }
          break;

        default:
          break;
      }
    });

    this.traderApi.on<ctp.TradeField>(ctp.TraderEvent.RtnTrade, (trade) => {
      const orderId = this._calcOrderId(trade);
      const trades = this.trades.get(orderId);

      if (trades) {
        trades.push(trade);
      } else {
        this.trades.set(orderId, [trade]);
      }

      const order = this.orders.get(orderId);

      if (order) {
        const orderData = this._toOrderData(order);
        const tradeData = this._toTradeData(trade);

        this.receivers.forEach((receiver) =>
          receiver.onTrade(orderData, tradeData),
        );
      }
    });

    this.traderApi.on<ctp.InstrumentMarginRateField>(
      ctp.TraderEvent.RspQryInstrumentMarginRate,
      (marginRate, options) => {
        const query = this.marginRatesQueue.shift();

        if (this._isErrorResp(lifecycle, options, "query-margin-rate-error")) {
          if (query) {
            query.receiver.onMarginRate(undefined);
          }

          return;
        }

        if (marginRate) {
          this.marginRates.set(marginRate.InstrumentID, marginRate);

          if (query) {
            query.receiver.onMarginRate(
              this._toMarginRate(query.symbol, marginRate),
            );
          }
        }

        this._processMarginRatesQueue();
      },
    );

    this.traderApi.on<ctp.InstrumentCommissionRateField>(
      ctp.TraderEvent.RspQryInstrumentCommissionRate,
      (commRate, options) => {
        const query = this.commRatesQueue.shift();

        if (
          this._isErrorResp(lifecycle, options, "query-commission-rate-error")
        ) {
          if (query) {
            query.receiver.onCommissionRate(undefined);
          }

          return;
        }

        if (commRate) {
          this.commRates.set(commRate.InstrumentID, commRate);

          if (query) {
            query.receiver.onCommissionRate(
              this._toCommissionRate(query.symbol, commRate),
            );
          }
        }

        this._processCommissionRatesQueue();
      },
    );

    return true;
  }

  close(lifecycle: ILifecycleListener) {
    if (!this.traderApi) {
      return;
    }

    this.traderApi.close();
    this.traderApi = undefined;

    lifecycle.onClose();
  }

  addReceiver(receiver: IOrderReceiver) {
    if (!this.receivers.includes(receiver)) {
      this.receivers.push(receiver);
    }
  }

  removeReceiver(receiver: IOrderReceiver) {
    const index = this.receivers.indexOf(receiver);

    if (index < 0) {
      return;
    }

    this.receivers.splice(index, 1);
  }

  getTradingDay() {
    return this.tradingDay;
  }

  queryCommissionRate(symbol: string, receiver: ICommissionRateReceiver) {
    const instrumentId = this._symbolToInstrumentId(symbol);
    const commRate = this.commRates.get(instrumentId);

    if (commRate) {
      receiver.onCommissionRate(this._toCommissionRate(symbol, commRate));
      return;
    }

    this.commRatesQueue.push({ symbol, receiver });

    if (this.commRatesQueue.size() === 1 && this.traderApi) {
      this._withRetry(() =>
        this.traderApi!.reqQryInstrumentCommissionRate({
          ...this.userInfo,
          InstrumentID: instrumentId,
        }),
      );
    }
  }

  queryMarginRate(symbol: string, receiver: IMarginRateReceiver) {
    const instrumentId = this._symbolToInstrumentId(symbol);
    const marginRate = this.marginRates.get(instrumentId);

    if (marginRate) {
      receiver.onMarginRate(this._toMarginRate(symbol, marginRate));
      return;
    }

    this.marginRatesQueue.push({ symbol, receiver });

    if (this.marginRatesQueue.size() === 1 && this.traderApi) {
      this._withRetry(() =>
        this.traderApi!.reqQryInstrumentMarginRate({
          ...this.userInfo,
          HedgeFlag: ctp.HedgeFlagType.Speculation,
          InstrumentID: instrumentId,
        }),
      );
    }
  }

  queryInstrument(symbol: string, receiver: IInstrumentReceiver) {
    const instrumentId = this._symbolToInstrumentId(symbol);

    const instrument = this.instruments.find(
      (instrument) => instrument.InstrumentID === instrumentId,
    );

    receiver.onInstrument(
      instrument ? this._toInstrumentData(instrument) : undefined,
    );
  }

  queryInstruments(receiver: IInstrumentsReceiver, type?: ProductType) {
    switch (type) {
      case "future":
        receiver.onInstruments(
          this.instruments
            .filter(
              (instrument) =>
                instrument.ProductClass === ctp.ProductClassType.Futures,
            )
            .map(this._toInstrumentData),
        );
        break;
      case "option":
        receiver.onInstruments(
          this.instruments
            .filter(
              (instrument) =>
                instrument.ProductClass === ctp.ProductClassType.Options,
            )
            .map(this._toInstrumentData),
        );
        break;
      default:
        receiver.onInstruments(this.instruments.map(this._toInstrumentData));
        break;
    }
  }

  queryTradingAccounts(receiver: ITradingAccountsReceiver) {}

  queryPositions(receiver: IPositionsReceiver) {}

  queryOrders(receiver: IOrdersReceiver) {
    const orders: OrderData[] = [];

    this.orders.forEach((order) => {
      orders.push(this._toOrderData(order));
    });

    receiver.onOrders(orders);
  }

  private _calcOrderId(orderOrTrade: ctp.OrderField | ctp.TradeField) {
    const { ExchangeID, TraderID, OrderLocalID } = orderOrTrade;
    return `${ExchangeID}:${TraderID}:${OrderLocalID}`;
  }

  private _calcReceiptId(order: ctp.OrderField | ctp.InputOrderActionField) {
    return `${order.FrontID}:${order.SessionID}:${parseInt(order.OrderRef)}`;
  }

  private _calcOrderStatus(order: ctp.OrderField): OrderStatus {
    switch (order.OrderStatus) {
      case ctp.OrderStatusType.Unknown:
        return "submitted";

      case ctp.OrderStatusType.AllTraded:
        return "filled";

      case ctp.OrderStatusType.Canceled:
        switch (order.OrderSubmitStatus) {
          case ctp.OrderSubmitStatusType.InsertRejected:
          case ctp.OrderSubmitStatusType.CancelRejected:
          case ctp.OrderSubmitStatusType.ModifyRejected:
            return "rejected";
          default:
            return "canceled";
        }

      default:
        return "partially-filled";
    }
  }

  private _calcOrderFlag(orderPriceType: ctp.OrderPriceTypeType): OrderFlag {
    switch (orderPriceType) {
      case ctp.OrderPriceTypeType.LimitPrice:
        return "limit";
      default:
        return "market";
    }
  }

  private _calcSideType(direction: ctp.DirectionType): SideType {
    switch (direction) {
      case ctp.DirectionType.Buy:
        return "long";
      case ctp.DirectionType.Sell:
        return "short";
    }
  }

  private _calcOffsetType(offset: ctp.OffsetFlagType): OffsetType {
    switch (offset) {
      case ctp.OffsetFlagType.Open:
        return "open";
      case ctp.OffsetFlagType.CloseToday:
        return "close-today";
      default:
        return "close";
    }
  }

  private _calcProductType(productClass: ctp.ProductClassType): ProductType {
    switch (productClass) {
      case ctp.ProductClassType.Futures:
        return "future";
      case ctp.ProductClassType.Options:
        return "option";
      default:
        throw new Error(`Unsupported product class: ${productClass}`);
    }
  }

  private _toTradeData(trade: ctp.TradeField): TradeData {
    return Object.freeze({
      id: trade.TradeID,
      date: parseInt(trade.TradeDate),
      time: this._parseTime(trade.TradeTime),
      price: trade.Price,
      volume: trade.Volume,
    });
  }

  private _toOrderData(order: ctp.OrderField): OrderData {
    const orderId = this._calcOrderId(order);
    const trades = this.trades.get(orderId) ?? [];

    return Object.freeze({
      id: orderId,
      receiptId: this._calcReceiptId(order),
      symbol: `${order.InstrumentID}.${order.ExchangeID}`,
      date: parseInt(order.InsertDate),
      time: this._parseTime(order.InsertTime),
      flag: this._calcOrderFlag(order.OrderPriceType),
      side: this._calcSideType(order.Direction),
      offset: this._calcOffsetType(order.CombOffsetFlag as ctp.OffsetFlagType),
      price: order.LimitPrice,
      volume: order.VolumeTotalOriginal,
      traded: order.VolumeTotalOriginal - order.VolumeTotal,
      status: this._calcOrderStatus(order),
      trades: trades.map(this._toTradeData),
      cancelTime:
        order.CancelTime !== "" ? this._parseTime(order.CancelTime) : undefined,
    });
  }

  private _toInstrumentData(instrument: ctp.InstrumentField): InstrumentData {
    return Object.freeze({
      symbol: `${instrument.InstrumentID}.${instrument.ExchangeID}`,
      id: instrument.InstrumentID,
      name: instrument.InstrumentName,
      exchangeId: instrument.ExchangeID,
      productId: instrument.ProductID,
      productType: this._calcProductType(instrument.ProductClass),
      deliveryTime: instrument.DeliveryYear * 100 + instrument.DeliveryMonth,
      createDate: parseInt(instrument.CreateDate),
      openDate: parseInt(instrument.OpenDate),
      expireDate: parseInt(instrument.ExpireDate),
      multiple: instrument.VolumeMultiple,
      priceTick: instrument.PriceTick,
      maxLimitOrderVolume: instrument.MaxLimitOrderVolume,
      minLimitOrderVolume: instrument.MinLimitOrderVolume,
    });
  }

  private _toCommissionRate(
    symbol: string,
    commRate: ctp.InstrumentCommissionRateField,
  ): CommissionRate {
    return Object.freeze({
      symbol: symbol,
      open: Object.freeze({
        ratio: commRate.OpenRatioByMoney,
        amount: commRate.OpenRatioByVolume,
      }),
      close: Object.freeze({
        ratio: commRate.CloseRatioByMoney,
        amount: commRate.CloseRatioByVolume,
      }),
      closeToday: Object.freeze({
        ratio: commRate.CloseTodayRatioByMoney,
        amount: commRate.CloseTodayRatioByVolume,
      }),
    });
  }

  private _toMarginRate(
    symbol: string,
    marginRate: ctp.InstrumentMarginRateField,
  ): MarginRate {
    return Object.freeze({
      symbol: symbol,
      long: Object.freeze({
        ratio: marginRate.LongMarginRatioByMoney,
        amount: marginRate.LongMarginRatioByVolume,
      }),
      short: Object.freeze({
        ratio: marginRate.ShortMarginRatioByMoney,
        amount: marginRate.ShortMarginRatioByVolume,
      }),
    });
  }

  private _processMarginRatesQueue() {
    while (!this.marginRatesQueue.isEmpty()) {
      const nextQuery = this.marginRatesQueue.peekFront()!;

      const instrumentId = this._symbolToInstrumentId(nextQuery.symbol);
      const marginRate = this.marginRates.get(instrumentId);

      if (marginRate) {
        nextQuery.receiver.onMarginRate(
          this._toMarginRate(nextQuery.symbol, marginRate),
        );

        this.marginRatesQueue.shift();
      } else {
        this._withRetry(() =>
          this.traderApi!.reqQryInstrumentMarginRate({
            ...this.userInfo,
            HedgeFlag: ctp.HedgeFlagType.Speculation,
            InstrumentID: instrumentId,
          }),
        );
      }
    }
  }

  private _processCommissionRatesQueue() {
    while (!this.commRatesQueue.isEmpty()) {
      const nextQuery = this.commRatesQueue.peekFront()!;

      const instrumentId = this._symbolToInstrumentId(nextQuery.symbol);
      const commRate = this.commRates.get(instrumentId);

      if (commRate) {
        nextQuery.receiver.onCommissionRate(
          this._toCommissionRate(nextQuery.symbol, commRate),
        );

        this.commRatesQueue.shift();
      } else {
        this._withRetry(() =>
          this.traderApi!.reqQryInstrumentCommissionRate({
            ...this.userInfo,
            InstrumentID: instrumentId,
          }),
        );
      }
    }
  }
}

export const createTrader = (
  flowTdPath: string,
  frontTdAddrs: string | string[],
  userInfo: UserInfo,
) => new Trader(flowTdPath, frontTdAddrs, userInfo);
