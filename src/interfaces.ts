/*
 * interfaces.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/hft-js/hft.js
 */

import {
  CommissionRate,
  InstrumentData,
  MarginRate,
  OffsetType,
  OrderData,
  OrderFlag,
  PositionData,
  SideType,
  TickData,
  TradeData,
  TradingAccount,
} from "./typedef.js";

export type RiskType = "place-order-risk" | "cancel-order-risk" | "custom-risk";

export interface IPlaceOrderRiskManager {
  onPlaceOrder: (
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
  ) => boolean | string;
}

export interface ICancelOrderRiskManager {
  onCancelOrder: (order: OrderData) => boolean | string;
}

export interface IRiskManagerReceiver {
  onRisk: (type: RiskType, reason?: string) => void;
}

export interface ILifecycleListener {
  onInit: () => void;
  onDestroy: () => void;
}

export interface IOrderReceiver {
  onEntrust: (order: OrderData) => void;
  onTrade: (order: OrderData, trade: TradeData) => void;
  onCancel: (order: OrderData) => void;
  onReject: (order: OrderData) => void;
}

export interface ITickReceiver {
  onTick: (tick: TickData) => void;
}

export interface ITickSubscriber {
  subscribe: (symbols: string[], receiver: ITickReceiver) => void;
}

export interface ITickUnsubscriber {
  unsubscribe: (symbols: string[], receiver: ITickReceiver) => void;
}

export interface IStrategy extends IRiskManagerReceiver, IOrderReceiver {
  onInit: (subscriber: ITickSubscriber) => void;
  onDestroy: (unsubscriber: ITickUnsubscriber) => void;
}

export interface ICommissionRateReceiver {
  onCommissionRate: (rate: CommissionRate) => void;
}

export interface IMarginRateReceiver {
  onMarginRate: (rate: MarginRate) => void;
}

export interface IInstrumentReceiver {
  onInstrument: (instrument: InstrumentData) => void;
}

export interface ITradingAccountReceiver {
  onTradingAccount: (account: TradingAccount) => void;
}

export interface IPositionReceiver {
  onPosition: (position: PositionData) => void;
}

export interface IProvider {
  login: (lifecycle: ILifecycleListener) => boolean;
  logout: (lifecycle: ILifecycleListener) => void;
}

export interface IOrderEmitter {
  addReceiver: (receiver: IOrderReceiver) => void;
  removeReceiver: (receiver: IOrderReceiver) => void;
}

export interface IMarketProvider
  extends IProvider,
    ITickSubscriber,
    ITickUnsubscriber {}

export interface ITraderProvider extends IProvider, IOrderEmitter {
  placeOrder: (
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
  ) => string;

  cancelOrder: (order: OrderData) => boolean;
  getTradingDay: () => number;

  queryCommissionRate: (
    symbol: string,
    receiver: ICommissionRateReceiver,
  ) => void;

  queryMarginRate: (symbol: string, receiver: IMarginRateReceiver) => void;
  queryInstrument: (receiver: IInstrumentReceiver) => void;
  queryTradingAccount: (receiver: ITradingAccountReceiver) => void;
  queryPosition: (receiver: IPositionReceiver) => void;
  queryOrder: (receiver: IOrderReceiver) => void;
}

export interface IRuntimeEngine {
  addStrategy: (strategy: IStrategy) => void;
  addPlaceOrderRiskManager: (riskMgr: IPlaceOrderRiskManager) => void;
  addCancelOrderRiskManager: (riskMgr: ICancelOrderRiskManager) => void;
  emitCustomRisk: (reason: string) => void;
}
