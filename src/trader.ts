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
import ctp, { type Trader as TraderApi } from "napi-ctp";
import type {
  DepthMarketDataField,
  DirectionType,
  InputOrderActionField,
  InputOrderField,
  InstrumentCommissionRateField,
  InstrumentField,
  InstrumentMarginRateField,
  InvestorPositionDetailField,
  InvestorPositionField,
  OffsetFlagType,
  OptionsTypeType,
  OrderField,
  OrderPriceTypeType,
  ProductClassType,
  RspAuthenticateField,
  RspUserLoginField,
  SettlementInfoConfirmField,
  TradeField,
  TradingAccountField,
} from "@napi-ctp/types";
import { CTPProvider } from "./provider.js";
import { isValidPrice, parseSymbol } from "./utils.js";
import type {
  CommissionRate,
  InstrumentData,
  MarginRate,
  OffsetType,
  OptionsType,
  OrderData,
  OrderFlag,
  OrderStatistic,
  OrderStatus,
  PositionData,
  PositionDetail,
  PriceRange,
  ProductType,
  SideType,
  TickData,
  TradeData,
  TradingAccount,
  Writeable,
} from "./typedef.js";
import type {
  ICancelOrderResultReceiver,
  ICommissionRateReceiver,
  IInstrumentReceiver,
  IInstrumentsReceiver,
  ILifecycleListener,
  IMarginRateReceiver,
  IOrderReceiver,
  IOrdersReceiver,
  IPlaceOrderResultReceiver,
  IPositionDetailsReceiver,
  IPositionReceiver,
  IPositionsReceiver,
  ITraderProvider,
  ITradingAccountsReceiver,
} from "./interfaces.js";

type PositionInfo = Writeable<PositionData>;
type OrderStat = Writeable<OrderStatistic>;

type MarginRateQuery = {
  symbol: string;
  receiver: IMarginRateReceiver;
};

type CommissionRateQuery = {
  symbol: string;
  receiver: ICommissionRateReceiver;
};

type MarketOrder = {
  symbol: string;
  offset: OffsetType;
  side: SideType;
  volume: number;
  receiver: IPlaceOrderResultReceiver;
};

export type CTPUserInfo = {
  BrokerID: string;
  UserID: string;
  Password: string;
  InvestorID: string;
  UserProductInfo: string;
  AuthCode: string;
  AppID: string;
};

export type FastQueryLastTickFunc = (
  instrumentId: string,
) => TickData | undefined;

export type TraderOptions = {
  fastQueryLastTick?: FastQueryLastTickFunc;
};

export class Trader extends CTPProvider implements ITraderProvider {
  private traderApi?: TraderApi;
  private tradingDay: number;
  private frontId: number;
  private sessionId: number;
  private orderRef: number;
  private accountsQueryTime: number;
  private positionDetailsChanged: boolean;
  private readonly fastQueryLastTick?: FastQueryLastTickFunc;
  private readonly userInfo: CTPUserInfo;
  private readonly receivers: IOrderReceiver[];
  private readonly accounts: TradingAccountField[];
  private readonly positionDetails: InvestorPositionDetailField[];
  private readonly instruments: Map<string, InstrumentField>;
  private readonly positions: Map<string, PositionInfo>;
  private readonly orders: Map<string, OrderField>;
  private readonly trades: Map<string, TradeField[]>;
  private readonly marginRates: Map<string, InstrumentMarginRateField>;
  private readonly commRates: Map<string, InstrumentCommissionRateField>;
  private readonly placeOrders: Map<number, IPlaceOrderResultReceiver>;
  private readonly cancelOrders: Map<number, ICancelOrderResultReceiver>;
  private readonly marketOrdersQueue: Map<string, Denque<MarketOrder>>;
  private readonly priceLimit: Map<string, PriceRange>;
  private readonly orderStatistics: Map<string, OrderStat>;
  private readonly marginRatesQueue: Denque<MarginRateQuery>;
  private readonly commRatesQueue: Denque<CommissionRateQuery>;
  private readonly accountsQueue: Denque<ITradingAccountsReceiver>;
  private readonly positionDetailsQueue: Denque<IPositionDetailsReceiver>;

  constructor(
    flowTdPath: string,
    frontTdAddrs: string | string[],
    userInfo: CTPUserInfo,
    options?: TraderOptions,
  ) {
    super(flowTdPath, frontTdAddrs);
    this.tradingDay = 0;
    this.frontId = 0;
    this.sessionId = 0;
    this.orderRef = 0;
    this.accountsQueryTime = 0;
    this.positionDetailsChanged = true;
    this.userInfo = userInfo;
    this.receivers = [];
    this.accounts = [];
    this.positionDetails = [];
    this.instruments = new Map();
    this.positions = new Map();
    this.orders = new Map();
    this.trades = new Map();
    this.marginRates = new Map();
    this.commRates = new Map();
    this.placeOrders = new Map();
    this.cancelOrders = new Map();
    this.marketOrdersQueue = new Map();
    this.priceLimit = new Map();
    this.orderStatistics = new Map();
    this.marginRatesQueue = new Denque();
    this.commRatesQueue = new Denque();
    this.accountsQueue = new Denque();
    this.positionDetailsQueue = new Denque();

    if (options?.fastQueryLastTick) {
      this.fastQueryLastTick = options.fastQueryLastTick;
    }
  }

  open(lifecycle: ILifecycleListener) {
    if (this.traderApi) {
      return true;
    }

    this.traderApi = ctp.createTrader(this.flowPath, this.frontAddrs);

    this.traderApi.on(ctp.TraderEvent.FrontConnected, () => {
      this._withRetry(() => this.traderApi!.reqAuthenticate(this.userInfo));
    });

    this.traderApi.on(ctp.TraderEvent.FrontDisconnected, () => {
      this._clearAllMarketOrders();
      this.placeOrders.clear();
      this.cancelOrders.clear();
    });

    this.traderApi.on<RspAuthenticateField>(
      ctp.TraderEvent.RspAuthenticate,
      (_, options) => {
        if (this._isErrorResp(lifecycle, options, "login-error")) {
          return;
        }

        this._withRetry(() => this.traderApi!.reqUserLogin(this.userInfo));
      },
    );

    this.traderApi.on<RspUserLoginField>(
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
          this.orderStatistics.clear();
          this.priceLimit.clear();
          this.tradingDay = tradingDay;
        }

        this._withRetry(() =>
          this.traderApi!.reqSettlementInfoConfirm(this.userInfo),
        );
      },
    );

    this.traderApi.on<SettlementInfoConfirmField>(
      ctp.TraderEvent.RspSettlementInfoConfirm,
      (_, options) => {
        if (this._isErrorResp(lifecycle, options, "login-error")) {
          return;
        }

        this.orders.clear();
        this._withRetry(() => this.traderApi!.reqQryOrder(this.userInfo));
      },
    );

    this.traderApi.on<OrderField>(
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

    this.traderApi.on<TradeField>(
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
          this.instruments.clear();
          this._withRetry(() => this.traderApi!.reqQryInstrument());
        }
      },
    );

    this.traderApi.on<InstrumentField>(
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
            this.instruments.set(instrument.InstrumentID, instrument);
          }
        }

        if (options.isLast) {
          this.positions.clear();

          this._withRetry(() =>
            this.traderApi!.reqQryInvestorPosition(this.userInfo),
          );
        }
      },
    );

    let fired = false;

    this.traderApi.on<InvestorPositionField>(
      ctp.TraderEvent.RspQryInvestorPosition,
      (position, options) => {
        if (this._isErrorResp(lifecycle, options, "query-positions-error")) {
          return;
        }

        if (position) {
          const symbol = this._toSymbol(position.InstrumentID);

          if (symbol) {
            let posInfo = this._ensurePositionInfo(symbol);
            const ExchangeSH = ["SHFE", "INE"];

            switch (position.PosiDirection) {
              case ctp.PosiDirectionType.Long:
                if (position.PositionDate === ctp.PositionDateType.Today) {
                  if (ExchangeSH.includes(position.ExchangeID)) {
                    posInfo.today.long.position += position.TodayPosition;
                  } else {
                    posInfo.today.long.position += position.Position;
                  }
                } else {
                  posInfo.history.long.position +=
                    position.Position - position.TodayPosition;
                }
                break;

              case ctp.PosiDirectionType.Short:
                if (position.PositionDate === ctp.PositionDateType.Today) {
                  if (ExchangeSH.includes(position.ExchangeID)) {
                    posInfo.today.short.position += position.TodayPosition;
                  } else {
                    posInfo.today.short.position += position.Position;
                  }
                } else {
                  posInfo.history.short.position +=
                    position.Position - position.TodayPosition;
                }
                break;
            }
          }
        }

        if (options.isLast) {
          if (!fired) {
            fired = true;
            lifecycle.onOpen();
          }

          if (this.accountsQueue.size() > 0) {
            this._withRetry(() =>
              this.traderApi!.reqQryTradingAccount(this.userInfo),
            );
          }

          if (this.positionDetailsQueue.size() > 0) {
            this._withRetry(() =>
              this.traderApi!.reqQryInvestorPositionDetail(this.userInfo),
            );
          }

          this._processMarginRatesQueue();
          this._processCommissionRatesQueue();
        }
      },
    );

    this.traderApi.on<OrderField>(ctp.TraderEvent.RtnOrder, (order) => {
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
            const symbol = this._toSymbol(order.InstrumentID);

            if (symbol) {
              if (orderData.offset === "open") {
                this._recordPending(
                  symbol,
                  orderData.side,
                  orderData.offset,
                  orderData.volume,
                );
              } else {
                this._freezePosition(
                  symbol,
                  orderData.side,
                  orderData.offset,
                  orderData.volume,
                );
              }

              const statistic = this._ensureOrderStatistic(symbol);

              statistic.entrusts += 1;
            }

            this.receivers.forEach((receiver) => receiver.onEntrust(orderData));
          }
          break;

        case "filled":
          {
            const symbol = this._toSymbol(order.InstrumentID);

            if (symbol) {
              const statistic = this._ensureOrderStatistic(symbol);

              statistic.filleds += 1;
            }
          }
          break;

        case "canceled":
          {
            const orderData = this._toOrderData(order);
            const symbol = this._toSymbol(order.InstrumentID);

            if (symbol) {
              if (orderData.offset === "open") {
                this._recoverPending(
                  symbol,
                  orderData.side,
                  orderData.offset,
                  orderData.volume,
                );
              } else {
                this._unfreezePosition(
                  symbol,
                  orderData.side,
                  orderData.offset,
                  orderData.volume,
                );
              }

              const statistic = this._ensureOrderStatistic(symbol);

              statistic.cancels += 1;
            }

            this.receivers.forEach((receiver) => receiver.onCancel(orderData));
          }
          break;

        case "rejected":
          {
            const orderData = this._toOrderData(order);
            const symbol = this._toSymbol(order.InstrumentID);

            if (symbol) {
              const statistic = this._ensureOrderStatistic(symbol);

              statistic.rejects += 1;
            }

            this.receivers.forEach((receiver) => receiver.onReject(orderData));
          }
          break;
      }
    });

    this.traderApi.on<TradeField>(ctp.TraderEvent.RtnTrade, (trade) => {
      const orderId = this._calcOrderId(trade);
      const trades = this.trades.get(orderId);

      if (trades) {
        trades.push(trade);
      } else {
        this.trades.set(orderId, [trade]);
      }

      this.positionDetailsChanged = true;

      const order = this.orders.get(orderId);

      if (order) {
        const orderData = this._toOrderData(order);
        const tradeData = this._toTradeData(trade);
        const symbol = this._toSymbol(order.InstrumentID);

        if (symbol) {
          this._calcPosition(
            symbol,
            orderData.side,
            orderData.offset,
            tradeData.volume,
          );
        }

        this.receivers.forEach((receiver) =>
          receiver.onTrade(orderData, tradeData),
        );
      }
    });

    this.traderApi.on<InstrumentMarginRateField>(
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

    this.traderApi.on<InstrumentCommissionRateField>(
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

    this.traderApi.on<TradingAccountField>(
      ctp.TraderEvent.RspQryTradingAccount,
      (account, options) => {
        if (this._isErrorResp(lifecycle, options, "query-accounts-error")) {
          const receivers = this.accountsQueue.toArray();

          receivers.forEach((receiver) =>
            receiver.onTradingAccounts(undefined),
          );

          this.accountsQueue.clear();
          return;
        }

        if (account) {
          this.accounts.push(account);
        }

        if (options.isLast) {
          const accounts = this.accounts.map(this._toTradingAccount, this);
          const receivers = this.accountsQueue.toArray();

          receivers.forEach((receiver) => receiver.onTradingAccounts(accounts));
          this.accountsQueue.clear();

          this.accountsQueryTime = Date.now();
        }
      },
    );

    this.traderApi.on<InvestorPositionDetailField>(
      ctp.TraderEvent.RspQryInvestorPositionDetail,
      (positionDetail, options) => {
        if (
          this._isErrorResp(lifecycle, options, "query-position-details-error")
        ) {
          const receivers = this.positionDetailsQueue.toArray();

          receivers.forEach((receiver) =>
            receiver.onPositionDetails(undefined),
          );
          this.positionDetailsQueue.clear();

          return;
        }

        if (positionDetail) {
          this.positionDetails.push(positionDetail);
        }

        if (options.isLast) {
          const positionDetails = this.positionDetails.map(
            this._toPositionDetail,
            this,
          );
          const receivers = this.positionDetailsQueue.toArray();

          this.positionDetailsChanged = false;

          receivers.forEach((receiver) =>
            receiver.onPositionDetails(positionDetails),
          );
          this.positionDetailsQueue.clear();
        }
      },
    );

    this.traderApi.on<InputOrderField>(
      ctp.TraderEvent.RspOrderInsert,
      (order, options) => {
        if (options.rspInfo && order && options.requestId && options.isLast) {
          const receiver = this.placeOrders.get(options.requestId);

          if (receiver) {
            this.placeOrders.delete(options.requestId);

            receiver.onPlaceOrderError(
              `${options.rspInfo.ErrorID}: ${options.rspInfo.ErrorMsg}`,
            );
          }
        }
      },
    );

    this.traderApi.on<InputOrderActionField>(
      ctp.TraderEvent.RspOrderAction,
      (order, options) => {
        if (options.rspInfo && order && options.requestId && options.isLast) {
          const receiver = this.cancelOrders.get(options.requestId);

          if (receiver) {
            this.cancelOrders.delete(options.requestId);

            receiver.onCancelOrderError(
              `${options.rspInfo.ErrorID}: ${options.rspInfo.ErrorMsg}`,
            );
          }
        }
      },
    );

    this.traderApi.on<DepthMarketDataField>(
      ctp.TraderEvent.RspQryDepthMarketData,
      (depthMarketData, options) => {
        if (
          this._isErrorResp(lifecycle, options, "query-depth-market-data-error")
        ) {
          this._clearAllMarketOrders();
          return;
        }

        const isLimitPrice =
          !isValidPrice(depthMarketData.BandingUpperPrice) ||
          !isValidPrice(depthMarketData.BandingLowerPrice);

        if (isLimitPrice) {
          this.priceLimit.set(depthMarketData.InstrumentID, {
            upper: depthMarketData.UpperLimitPrice,
            lower: depthMarketData.LowerLimitPrice,
          });
        }

        const queue = this.marketOrdersQueue.get(depthMarketData.InstrumentID);

        if (!queue) {
          return;
        }

        if (!queue.isEmpty()) {
          const upperPrice = isLimitPrice
            ? depthMarketData.UpperLimitPrice
            : depthMarketData.BandingUpperPrice;

          const lowerPrice = isLimitPrice
            ? depthMarketData.LowerLimitPrice
            : depthMarketData.BandingLowerPrice;

          const orders = queue.toArray();

          orders.forEach((order) => {
            switch (order.side) {
              case "long":
                this._placeLimitOrder(
                  order.symbol,
                  order.offset,
                  order.side,
                  order.volume,
                  upperPrice,
                  order.receiver,
                );
                break;

              case "short":
                this._placeLimitOrder(
                  order.symbol,
                  order.offset,
                  order.side,
                  order.volume,
                  lowerPrice,
                  order.receiver,
                );
                break;
            }
          });
        }

        this.marketOrdersQueue.delete(depthMarketData.InstrumentID);
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

  addOrderReceiver(receiver: IOrderReceiver) {
    if (!this.receivers.includes(receiver)) {
      this.receivers.push(receiver);
    }
  }

  removeOrderReceiver(receiver: IOrderReceiver) {
    const index = this.receivers.indexOf(receiver);

    if (index < 0) {
      return;
    }

    this.receivers.splice(index, 1);
  }

  getTradingDay() {
    return this.tradingDay;
  }

  getOrderStatistics() {
    const statistics = Array.from(this.orderStatistics.values());
    return statistics.map((stat) => Object.freeze({ ...stat }));
  }

  getOrderStatistic(symbol: string) {
    const statistic = this.orderStatistics.get(symbol);

    if (!statistic) {
      return Object.freeze({
        symbol: symbol,
        places: 0,
        entrusts: 0,
        filleds: 0,
        cancels: 0,
        rejects: 0,
      });
    }

    return Object.freeze({ ...statistic });
  }

  queryCommissionRate(symbol: string, receiver: ICommissionRateReceiver) {
    const [instrumentId] = parseSymbol(symbol);
    const commRate = this.commRates.get(instrumentId);

    if (commRate) {
      receiver.onCommissionRate(this._toCommissionRate(symbol, commRate));
      return;
    }

    this.commRatesQueue.push({ symbol, receiver });

    if (this.commRatesQueue.size() === 1) {
      this._withRetry(() =>
        this.traderApi?.reqQryInstrumentCommissionRate({
          ...this.userInfo,
          InstrumentID: instrumentId,
        }),
      );
    }
  }

  queryMarginRate(symbol: string, receiver: IMarginRateReceiver) {
    const [instrumentId] = parseSymbol(symbol);
    const marginRate = this.marginRates.get(instrumentId);

    if (marginRate) {
      receiver.onMarginRate(this._toMarginRate(symbol, marginRate));
      return;
    }

    this.marginRatesQueue.push({ symbol, receiver });

    if (this.marginRatesQueue.size() === 1) {
      this._withRetry(() =>
        this.traderApi?.reqQryInstrumentMarginRate({
          ...this.userInfo,
          HedgeFlag: ctp.HedgeFlagType.Speculation,
          InstrumentID: instrumentId,
        }),
      );
    }
  }

  queryInstrument(symbol: string, receiver: IInstrumentReceiver) {
    const [instrumentId, exchangeId] = parseSymbol(symbol);
    const instrument = this.instruments.get(instrumentId);

    receiver.onInstrument(
      instrument && instrument.ExchangeID === exchangeId
        ? this._toInstrumentData(instrument)
        : undefined,
    );
  }

  queryPosition(symbol: string, receiver: IPositionReceiver) {
    const position = this.positions.get(symbol);

    if (position) {
      receiver.onPosition(this._toPositionData(position));
      return;
    }

    const [instrumentId] = parseSymbol(symbol);

    if (!this.instruments.has(instrumentId)) {
      receiver.onPosition(undefined);
      return;
    }

    receiver.onPosition(
      Object.freeze({
        symbol: symbol,
        today: Object.freeze({
          long: Object.freeze({ position: 0, frozen: 0 }),
          short: Object.freeze({ position: 0, frozen: 0 }),
        }),
        history: Object.freeze({
          long: Object.freeze({ position: 0, frozen: 0 }),
          short: Object.freeze({ position: 0, frozen: 0 }),
        }),
        pending: Object.freeze({ long: 0, short: 0 }),
      }),
    );
  }

  queryInstruments(receiver: IInstrumentsReceiver, type?: ProductType) {
    const instruments = Array.from(this.instruments.values());

    switch (type) {
      case "futures":
        receiver.onInstruments(
          instruments
            .filter(
              (instrument) =>
                instrument.ProductClass === ctp.ProductClassType.Futures,
            )
            .map(this._toInstrumentData, this),
        );
        break;

      case "options":
        receiver.onInstruments(
          instruments
            .filter(
              (instrument) =>
                instrument.ProductClass === ctp.ProductClassType.Options,
            )
            .map(this._toInstrumentData, this),
        );
        break;

      default:
        receiver.onInstruments(instruments.map(this._toInstrumentData, this));
        break;
    }
  }

  queryTradingAccounts(receiver: ITradingAccountsReceiver) {
    if (this.accountsQueue.size() > 0) {
      this.accountsQueue.push(receiver);
      return;
    }

    const elapsed = Date.now() - this.accountsQueryTime;

    if (elapsed < 3000) {
      receiver.onTradingAccounts(
        this.accounts.map(this._toTradingAccount, this),
      );
      return;
    }

    this.accountsQueue.push(receiver);
    this.accounts.splice(0, this.accounts.length);

    this._withRetry(() => this.traderApi?.reqQryTradingAccount(this.userInfo));
  }

  queryPositionDetails(receiver: IPositionDetailsReceiver) {
    if (this.positionDetailsQueue.size() > 0) {
      this.positionDetailsQueue.push(receiver);
      return;
    }

    if (!this.positionDetailsChanged) {
      receiver.onPositionDetails(
        this.positionDetails.map(this._toPositionDetail, this),
      );
      return;
    }

    this.positionDetailsQueue.push(receiver);
    this.positionDetails.splice(0, this.positionDetails.length);

    this._withRetry(() =>
      this.traderApi?.reqQryInvestorPositionDetail(this.userInfo),
    );
  }

  queryPositions(receiver: IPositionsReceiver) {
    const positions: PositionData[] = [];

    this.positions.forEach((position) =>
      positions.push(this._toPositionData(position)),
    );

    receiver.onPositions(positions);
  }

  queryOrders(receiver: IOrdersReceiver) {
    const orders: OrderData[] = [];

    this.orders.forEach((order) => {
      orders.push(this._toOrderData(order));
    });

    receiver.onOrders(orders);
  }

  private _placeLimitOrder(
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    receiver: IPlaceOrderResultReceiver,
  ) {
    const [instrumentId, exchangeId] = parseSymbol(symbol);
    const instrument = this.instruments.get(instrumentId);

    if (!instrument) {
      receiver.onPlaceOrderError("Instrument Not Found");
      return;
    }

    if (exchangeId !== instrument.ExchangeID) {
      receiver.onPlaceOrderError("Exchange Id Error");
      return;
    }

    let orderRef = 0;

    this._withRetry(() => {
      orderRef = ++this.orderRef;

      return this.traderApi?.reqOrderInsert({
        ...this.userInfo,
        OrderRef: `${orderRef}`,
        InstrumentID: instrumentId,
        ExchangeID: instrument.ExchangeID,
        LimitPrice: price,
        VolumeTotalOriginal: volume,
        VolumeCondition: ctp.VolumeConditionType.AV,
        TimeCondition: ctp.TimeConditionType.GFD,
        Direction: this._toDirection(side),
        OrderPriceType: ctp.OrderPriceTypeType.LimitPrice,
        CombOffsetFlag: this._toOffsetFlag(offset),
        CombHedgeFlag: ctp.HedgeFlagType.Speculation,
        ContingentCondition: ctp.ContingentConditionType.Immediately,
        ForceCloseReason: ctp.ForceCloseReasonType.NotForceClose,
        IsAutoSuspend: 0,
        UserForceClose: 0,
      });
    }).then((requestId) => {
      if (!requestId || requestId < 0) {
        receiver.onPlaceOrderError("Request Error");
        return;
      }

      const statistic = this._ensureOrderStatistic(symbol);

      statistic.places += 1;

      this.placeOrders.set(requestId, receiver);

      const receiptId = `${this.frontId}:${this.sessionId}:${orderRef}`;

      receiver.onPlaceOrderSent(receiptId);

      return receiptId;
    });
  }

  private _clearAllMarketOrders() {
    this.marketOrdersQueue.forEach((queue) => {
      const orders = queue.toArray();

      orders.forEach((order) => {
        order.receiver.onPlaceOrderError("Request Error");
      });
    });

    this.marketOrdersQueue.clear();
  }

  private _placeMarketOrder(
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    receiver: IPlaceOrderResultReceiver,
  ) {
    const [instrumentId, exchangeId] = parseSymbol(symbol);
    const instrument = this.instruments.get(instrumentId);

    if (!instrument) {
      receiver.onPlaceOrderError("Instrument Not Found");
      return;
    }

    if (exchangeId !== instrument.ExchangeID) {
      receiver.onPlaceOrderError("Exchange Id Error");
      return;
    }

    const priceRange = this.priceLimit.get(instrumentId);

    if (priceRange) {
      switch (side) {
        case "long":
          this._placeLimitOrder(
            symbol,
            offset,
            side,
            volume,
            priceRange.upper,
            receiver,
          );
          break;

        case "short":
          this._placeLimitOrder(
            symbol,
            offset,
            side,
            volume,
            priceRange.lower,
            receiver,
          );
          break;
      }

      return;
    }

    if (this.fastQueryLastTick) {
      const lastTick = this.fastQueryLastTick(instrumentId);

      if (lastTick && lastTick.tradingDay === this.tradingDay) {
        const isLimitPrice =
          !isValidPrice(lastTick.bandings.upper) ||
          !isValidPrice(lastTick.bandings.lower);

        if (isLimitPrice) {
          this.priceLimit.set(instrumentId, { ...lastTick.limits });
        }

        const upperPrice = isLimitPrice
          ? lastTick.limits.upper
          : lastTick.bandings.upper;

        const lowerPrice = isLimitPrice
          ? lastTick.limits.lower
          : lastTick.bandings.lower;

        switch (side) {
          case "long":
            this._placeLimitOrder(
              symbol,
              offset,
              side,
              volume,
              upperPrice,
              receiver,
            );
            break;

          case "short":
            this._placeLimitOrder(
              symbol,
              offset,
              side,
              volume,
              lowerPrice,
              receiver,
            );
            break;
        }

        return;
      }
    }

    let queue = this.marketOrdersQueue.get(instrumentId);

    if (queue) {
      queue.push({ symbol, offset, side, volume, receiver });
      return;
    }

    queue = new Denque();
    this.marketOrdersQueue.set(instrumentId, queue);

    this._withRetry(() =>
      this.traderApi?.reqQryDepthMarketData({
        ExchangeID: exchangeId,
        InstrumentID: instrumentId,
      }),
    ).then((requestId) => {
      if (!requestId || requestId < 0) {
        const orders = queue.toArray();

        orders.forEach((order) => {
          order.receiver.onPlaceOrderError("Request Error");
        });

        this.marketOrdersQueue.delete(instrumentId);

        return;
      }

      queue.push({ symbol, offset, side, volume, receiver });
    });
  }

  placeOrder(
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
    receiver: IPlaceOrderResultReceiver,
  ) {
    if (volume <= 0) {
      receiver.onPlaceOrderError("Invalid Volume");
      return;
    }

    switch (flag) {
      case "limit":
        return this._placeLimitOrder(
          symbol,
          offset,
          side,
          volume,
          price,
          receiver,
        );

      case "market":
        return this._placeMarketOrder(symbol, offset, side, volume, receiver);
    }
  }

  cancelOrder(order: OrderData, receiver: ICancelOrderResultReceiver) {
    const current = this.orders.get(order.id);

    if (!current) {
      receiver.onCancelOrderError("Order Not Found");
      return;
    }

    if (order.cancelTime) {
      receiver.onCancelOrderError("Already Canceled");
      return;
    }

    this._withRetry(() =>
      this.traderApi?.reqOrderAction({
        ...this.userInfo,
        InstrumentID: current.InstrumentID,
        FrontID: current.FrontID,
        SessionID: current.SessionID,
        OrderRef: current.OrderRef,
        ExchangeID: current.ExchangeID,
        OrderSysID: current.OrderSysID,
        ActionFlag: ctp.ActionFlagType.Delete,
      }),
    ).then((requestId) => {
      if (!requestId || requestId < 0) {
        receiver.onCancelOrderError("Request Error");
        return;
      }

      this.cancelOrders.set(requestId, receiver);

      receiver.onCancelOrderSent();
    });
  }

  private _toSymbol(instrumentId: string) {
    const instrument = this.instruments.get(instrumentId);

    if (!instrument) {
      return undefined;
    }

    return `${instrument.InstrumentID}.${instrument.ExchangeID}`;
  }

  private _calcOrderId(orderOrTrade: OrderField | TradeField) {
    const { ExchangeID, TraderID, OrderLocalID } = orderOrTrade;
    return `${ExchangeID}:${TraderID}:${OrderLocalID}`;
  }

  private _calcReceiptId(order: OrderField | InputOrderActionField) {
    return `${order.FrontID}:${order.SessionID}:${parseInt(order.OrderRef)}`;
  }

  private _calcOrderStatus(order: OrderField, traded?: number): OrderStatus {
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
        return traded && order.VolumeTotalOriginal === traded
          ? "filled"
          : "partially-filled";
    }
  }

  private _calcOrderFlag(orderPriceType: OrderPriceTypeType): OrderFlag {
    switch (orderPriceType) {
      case ctp.OrderPriceTypeType.LimitPrice:
        return "limit";

      default:
        return "market";
    }
  }

  private _calcSideType(direction: DirectionType): SideType {
    switch (direction) {
      case ctp.DirectionType.Buy:
        return "long";

      case ctp.DirectionType.Sell:
        return "short";
    }
  }

  private _toDirection(side: SideType) {
    switch (side) {
      case "long":
        return ctp.DirectionType.Buy;

      case "short":
        return ctp.DirectionType.Sell;
    }
  }

  private _calcOffsetType(offset: OffsetFlagType): OffsetType {
    switch (offset) {
      case ctp.OffsetFlagType.Open:
        return "open";

      case ctp.OffsetFlagType.CloseToday:
        return "close-today";

      default:
        return "close";
    }
  }

  private _toOffsetFlag(offset: OffsetType) {
    switch (offset) {
      case "open":
        return ctp.OffsetFlagType.Open;

      case "close":
        return ctp.OffsetFlagType.Close;

      case "close-today":
        return ctp.OffsetFlagType.CloseToday;
    }
  }

  private _calcProductType(productClass: ProductClassType): ProductType {
    switch (productClass) {
      case ctp.ProductClassType.Futures:
        return "futures";

      case ctp.ProductClassType.Options:
        return "options";

      case ctp.ProductClassType.Spot:
        return "spot";

      case ctp.ProductClassType.SpotOption:
        return "spot-options";

      default:
        throw new Error(`Unsupported product class: ${productClass}`);
    }
  }

  private _calcOptionsType(
    optionsType: OptionsTypeType,
  ): OptionsType | undefined {
    switch (optionsType) {
      case ctp.OptionsTypeType.CallOptions:
        return "call";

      case ctp.OptionsTypeType.PutOptions:
        return "put";

      default:
        return undefined;
    }
  }

  private _ensurePositionInfo(symbol: string): PositionInfo {
    let position = this.positions.get(symbol);

    if (!position) {
      position = {
        symbol: symbol,
        today: {
          long: { position: 0, frozen: 0 },
          short: { position: 0, frozen: 0 },
        },
        history: {
          long: { position: 0, frozen: 0 },
          short: { position: 0, frozen: 0 },
        },
        pending: { long: 0, short: 0 },
      };

      this.positions.set(symbol, position);
    }

    return position;
  }

  private _ensureOrderStatistic(symbol: string): OrderStat {
    let statistic = this.orderStatistics.get(symbol);

    if (!statistic) {
      statistic = {
        symbol: symbol,
        places: 0,
        entrusts: 0,
        filleds: 0,
        cancels: 0,
        rejects: 0,
      };

      this.orderStatistics.set(symbol, statistic);
    }

    return statistic;
  }

  private _calcPosition(
    symbol: string,
    side: SideType,
    offset: OffsetType,
    volume: number,
  ) {
    const position = this._ensurePositionInfo(symbol);

    switch (offset) {
      case "open":
        switch (side) {
          case "long":
            position.today.long.position += volume;

            if (position.pending.long >= volume) {
              position.pending.long -= volume;
            } else {
              position.pending.long = 0;
            }
            break;

          case "short":
            position.today.short.position += volume;

            if (position.pending.short >= volume) {
              position.pending.short -= volume;
            } else {
              position.pending.short = 0;
            }
            break;
        }
        break;

      case "close":
        switch (side) {
          case "long":
            if (position.history.short.position >= volume) {
              position.history.short.position -= volume;
            } else {
              const rest = volume - position.history.short.position;
              position.history.short.position -=
                position.history.short.position;

              if (rest > 0) {
                if (position.today.short.position >= rest) {
                  position.today.short.position -= rest;
                } else {
                  position.today.short.position = 0;
                }
              }
            }

            if (position.history.short.frozen >= volume) {
              position.history.short.frozen -= volume;
            } else {
              const rest = volume - position.history.short.frozen;
              position.history.short.frozen -= position.history.short.frozen;

              if (rest > 0) {
                if (position.today.short.frozen >= rest) {
                  position.today.short.frozen -= rest;
                } else {
                  position.today.short.frozen = 0;
                }
              }
            }
            break;

          case "short":
            if (position.history.long.position >= volume) {
              position.history.long.position -= volume;
            } else {
              const rest = volume - position.history.long.position;
              position.history.long.position -= position.history.long.position;

              if (rest > 0) {
                if (position.today.long.position >= rest) {
                  position.today.long.position -= rest;
                } else {
                  position.today.long.position = 0;
                }
              }
            }

            if (position.history.long.frozen >= volume) {
              position.history.long.frozen -= volume;
            } else {
              const rest = volume - position.history.long.frozen;
              position.history.long.frozen -= position.history.long.frozen;

              if (rest > 0) {
                if (position.today.long.frozen >= rest) {
                  position.today.long.frozen -= rest;
                } else {
                  position.today.long.frozen = 0;
                }
              }
            }
            break;
        }
        break;

      case "close-today":
        switch (side) {
          case "long":
            if (position.today.short.position >= volume) {
              position.today.short.position -= volume;
            } else {
              position.today.short.position = 0;
            }

            if (position.today.short.frozen >= volume) {
              position.today.short.frozen -= volume;
            } else {
              position.today.short.frozen = 0;
            }
            break;

          case "short":
            if (position.today.long.position >= volume) {
              position.today.long.position -= volume;
            } else {
              position.today.long.position = 0;
            }

            if (position.today.long.frozen >= volume) {
              position.today.long.frozen -= volume;
            } else {
              position.today.long.frozen = 0;
            }
            break;
        }
        break;
    }
  }

  private _recordPending(
    symbol: string,
    side: SideType,
    offset: OffsetType,
    volume: number,
  ) {
    if (offset !== "open") {
      return;
    }

    const position = this._ensurePositionInfo(symbol);

    switch (side) {
      case "long":
        position.pending.long += volume;
        break;

      case "short":
        position.pending.short += volume;
        break;
    }
  }

  private _recoverPending(
    symbol: string,
    side: SideType,
    offset: OffsetType,
    volume: number,
  ) {
    if (offset !== "open") {
      return;
    }

    const position = this.positions.get(symbol);

    if (!position) {
      return;
    }

    switch (side) {
      case "long":
        position.pending.long -= volume;
        break;

      case "short":
        position.pending.short -= volume;
        break;
    }
  }

  private _freezePosition(
    symbol: string,
    side: SideType,
    offset: OffsetType,
    volume: number,
  ) {
    const position = this.positions.get(symbol);

    if (!position) {
      return;
    }

    switch (offset) {
      case "close":
        switch (side) {
          case "long":
            position.history.short.frozen += volume;
            break;

          case "short":
            position.history.long.frozen += volume;
            break;
        }
        break;

      case "close-today":
        switch (side) {
          case "long":
            position.today.short.frozen += volume;
            break;

          case "short":
            position.today.long.frozen += volume;
            break;
        }
        break;
    }
  }

  private _unfreezePosition(
    symbol: string,
    side: SideType,
    offset: OffsetType,
    volume: number,
  ) {
    const position = this.positions.get(symbol);

    if (!position) {
      return;
    }

    switch (offset) {
      case "close":
        switch (side) {
          case "long":
            if (position.history.short.frozen >= volume) {
              position.history.short.frozen -= volume;
            } else {
              position.history.short.frozen = 0;
            }

            break;

          case "short":
            if (position.history.long.frozen >= volume) {
              position.history.long.frozen -= volume;
            } else {
              position.history.long.frozen = 0;
            }
            break;
        }
        break;

      case "close-today":
        switch (side) {
          case "long":
            if (position.today.short.frozen >= volume) {
              position.today.short.frozen -= volume;
            } else {
              position.today.short.frozen = 0;
            }
            break;

          case "short":
            if (position.today.long.frozen >= volume) {
              position.today.long.frozen -= volume;
            } else {
              position.today.long.frozen = 0;
            }
            break;
        }
        break;
    }
  }

  private _toTradeData(trade: TradeField): TradeData {
    return Object.freeze({
      id: trade.TradeID,
      date: parseInt(trade.TradeDate),
      time: this._parseTime(trade.TradeTime),
      price: trade.Price,
      volume: trade.Volume,
    });
  }

  private _toOrderData(order: OrderField): OrderData {
    const orderId = this._calcOrderId(order);
    const trades = this.trades.get(orderId) ?? [];

    const traded = trades
      .map((trade) => trade.Volume)
      .reduce((a, b) => a + b, 0);

    return Object.freeze({
      id: orderId,
      receiptId: this._calcReceiptId(order),
      symbol: `${order.InstrumentID}.${order.ExchangeID}`,
      date: parseInt(order.InsertDate),
      time: this._parseTime(order.InsertTime),
      flag: this._calcOrderFlag(order.OrderPriceType),
      side: this._calcSideType(order.Direction),
      offset: this._calcOffsetType(order.CombOffsetFlag as OffsetFlagType),
      price: order.LimitPrice,
      volume: order.VolumeTotalOriginal,
      traded: traded,
      status: this._calcOrderStatus(order, traded),
      trades: trades.map(this._toTradeData, this),
      cancelTime:
        order.CancelTime !== "" ? this._parseTime(order.CancelTime) : undefined,
    });
  }

  private _toInstrumentData(instrument: InstrumentField): InstrumentData {
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
      strikePrice: instrument.StrikePrice,
      optionsType: this._calcOptionsType(instrument.OptionsType),
    });
  }

  private _toCommissionRate(
    symbol: string,
    commRate: InstrumentCommissionRateField,
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
    marginRate: InstrumentMarginRateField,
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

  private _toTradingAccount(account: TradingAccountField): TradingAccount {
    return Object.freeze({
      id: account.AccountID,
      currency: account.CurrencyID,
      preBalance: account.PreBalance - account.Withdraw + account.Deposit,
      preMargin: account.PreMargin,
      balance: account.Balance,
      cash: account.Available,
      margin: account.CurrMargin,
      commission: account.Commission,
      frozenMargin: account.FrozenMargin,
      frozenCash: account.FrozenCash,
      frozenCommission: account.FrozenCommission,
    });
  }

  private _toPositionDetail(
    positionDetail: InvestorPositionDetailField,
  ): PositionDetail {
    return Object.freeze({
      symbol: this._toSymbol(positionDetail.InstrumentID)!,
      date: parseInt(positionDetail.OpenDate),
      side: this._calcSideType(positionDetail.Direction),
      price: positionDetail.OpenPrice,
      volume: positionDetail.Volume,
      margin: positionDetail.Margin,
    });
  }

  private _toPositionData(position: PositionInfo): PositionData {
    return Object.freeze({
      symbol: position.symbol,

      today: Object.freeze({
        long: Object.freeze({ ...position.today.long }),
        short: Object.freeze({ ...position.today.short }),
      }),
      history: Object.freeze({
        long: Object.freeze({ ...position.history.long }),
        short: Object.freeze({ ...position.history.short }),
      }),
      pending: Object.freeze({ ...position.pending }),
    });
  }

  private _processMarginRatesQueue() {
    while (!this.marginRatesQueue.isEmpty()) {
      const nextQuery = this.marginRatesQueue.peekFront()!;

      const [instrumentId] = parseSymbol(nextQuery.symbol);
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

      const [instrumentId] = parseSymbol(nextQuery.symbol);
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
  userInfo: CTPUserInfo,
  options?: TraderOptions,
) => new Trader(flowTdPath, frontTdAddrs, userInfo, options);
