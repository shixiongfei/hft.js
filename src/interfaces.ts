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

export type RiskType = "place-order-risk" | "cancel-order-risk";

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

export interface IOrdersReceiver {
  onOrders: (orders: OrderData[]) => void;
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

export interface IInstrumentsReceiver {
  onInstruments: (instrument: InstrumentData[]) => void;
}

export interface ITradingAccountsReceiver {
  onTradingAccounts: (account: TradingAccount[]) => void;
}

export interface IPositionsReceiver {
  onPositions: (position: PositionData[]) => void;
}

export interface IProvider {
  login: (lifecycle: ILifecycleListener) => boolean;
  logout: (lifecycle: ILifecycleListener) => void;
}

export interface IOrderEmitter {
  addReceiver: (receiver: IOrderReceiver) => void;
  removeReceiver: (receiver: IOrderReceiver) => void;
}

export interface IQueryApi {
  getTradingDay: () => number;

  queryCommissionRate: (
    symbol: string,
    receiver: ICommissionRateReceiver,
  ) => void;

  queryMarginRate: (symbol: string, receiver: IMarginRateReceiver) => void;
  queryInstrument: (symbol: string, receiver: IInstrumentReceiver) => void;
  queryInstruments: (receiver: IInstrumentsReceiver) => void;
  queryTradingAccounts: (receiver: ITradingAccountsReceiver) => void;
  queryPositions: (receiver: IPositionsReceiver) => void;
  queryOrders: (receiver: IOrdersReceiver) => void;
}

export interface IMarketProvider
  extends IProvider,
    ITickSubscriber,
    ITickUnsubscriber {}

export interface ITraderProvider extends IProvider, IOrderEmitter, IQueryApi {
  placeOrder: (
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
  ) => string | undefined;

  cancelOrder: (order: OrderData) => boolean;
}

export interface IRuntimeEngine
  extends IQueryApi,
    ITickSubscriber,
    ITickUnsubscriber {
  addStrategy: (strategy: IStrategy) => void;
  addPlaceOrderRiskManager: (riskMgr: IPlaceOrderRiskManager) => void;
  addCancelOrderRiskManager: (riskMgr: ICancelOrderRiskManager) => void;

  placeOrder: (
    strategy: IStrategy,
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
  ) => string | undefined;

  cancelOrder: (strategy: IStrategy, order: OrderData) => boolean;
}
