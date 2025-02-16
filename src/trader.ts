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

import ctp from "napi-ctp";
import {
  ILifecycleListener,
  IOrderReceiver,
  ITraderProvider,
} from "./interfaces.js";
import { CTPProvider, UserInfo } from "./provider.js";

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
          this.instruments.push(instrument);
        }

        if (options.isLast && !fired) {
          fired = true;
          lifecycle.onOpen();
        }
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

  private _calcOrderId(orderOrTrade: ctp.OrderField | ctp.TradeField) {
    const { ExchangeID, TraderID, OrderLocalID } = orderOrTrade;
    return `${ExchangeID}:${TraderID}:${OrderLocalID}`;
  }
}

export const createTrader = (
  flowTdPath: string,
  frontTdAddrs: string | string[],
  userInfo: UserInfo,
) => new Trader(flowTdPath, frontTdAddrs, userInfo);
