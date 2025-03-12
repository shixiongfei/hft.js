/*
 * interfaces.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import {
  BarData,
  CommissionRate,
  InstrumentData,
  MarginRate,
  OffsetType,
  OrderData,
  OrderFlag,
  OrderStatistic,
  PositionData,
  PositionDetail,
  ProductType,
  SideType,
  TapeData,
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

export type ErrorType =
  | "login-error"
  | "query-order-error"
  | "query-trade-error"
  | "query-instrument-error"
  | "query-margin-rate-error"
  | "query-commission-rate-error"
  | "query-accounts-error"
  | "query-positions-error"
  | "query-position-details-error";

export interface IErrorReceiver {
  onError: (error: ErrorType, message: string) => void;
}

export interface ILifecycleListener extends IErrorReceiver {
  onOpen: () => void;
  onClose: () => void;
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
  onTick: (tick: TickData, tape: TapeData) => void;
}

export interface ITickSubscriber {
  subscribe: (symbols: string[], receiver: ITickReceiver) => void;
}

export interface ITickUnsubscriber {
  unsubscribe: (symbols: string[], receiver: ITickReceiver) => void;
}

export interface IBarReceiver {
  onBar: (bar: BarData) => void;
  onUpdateBar?: (bar: BarData, tick: TickData, tape: TapeData) => void;
}

export interface IBarSubscriber {
  subscribeBar: (symbols: string[], receiver: IBarReceiver) => void;
}

export interface IBarUnsubscriber {
  unsubscribeBar: (symbols: string[], receiver: IBarReceiver) => void;
}

export interface IStrategy extends IRiskManagerReceiver, IOrderReceiver {
  onInit: () => void;
  onDestroy: () => void;
}

export interface ICommissionRateReceiver {
  onCommissionRate: (rate: CommissionRate | undefined) => void;
}

export interface IMarginRateReceiver {
  onMarginRate: (rate: MarginRate | undefined) => void;
}

export interface IInstrumentReceiver {
  onInstrument: (instrument: InstrumentData | undefined) => void;
}

export interface IInstrumentsReceiver {
  onInstruments: (instruments: InstrumentData[] | undefined) => void;
}

export interface ITradingAccountsReceiver {
  onTradingAccounts: (accounts: TradingAccount[] | undefined) => void;
}

export interface IPositionReceiver {
  onPosition: (position: PositionData | undefined) => void;
}

export interface IPositionsReceiver {
  onPositions: (positions: PositionData[] | undefined) => void;
}

export interface IPositionDetailsReceiver {
  onPositionDetails: (positionDetails: PositionDetail[] | undefined) => void;
}

export interface IProvider {
  open: (lifecycle: ILifecycleListener) => boolean;
  close: (lifecycle: ILifecycleListener) => void;
}

export interface IOrderEmitter {
  addReceiver: (receiver: IOrderReceiver) => void;
  removeReceiver: (receiver: IOrderReceiver) => void;
}

export interface IQueryProvider {
  getTradingDay: () => number;

  getOrderStatistics: () => OrderStatistic[];
  getOrderStatistic: (symbol: string) => OrderStatistic;

  queryCommissionRate: (
    symbol: string,
    receiver: ICommissionRateReceiver,
  ) => void;

  queryMarginRate: (symbol: string, receiver: IMarginRateReceiver) => void;
  queryInstrument: (symbol: string, receiver: IInstrumentReceiver) => void;
  queryPosition: (symbol: string, receiver: IPositionReceiver) => void;

  queryInstruments: (
    receiver: IInstrumentsReceiver,
    type?: ProductType,
  ) => void;

  queryTradingAccounts: (receiver: ITradingAccountsReceiver) => void;
  queryPositions: (receiver: IPositionsReceiver) => void;
  queryPositionDetails: (receiver: IPositionDetailsReceiver) => void;
  queryOrders: (receiver: IOrdersReceiver) => void;
}

export interface IMarketRecorderReceiver {
  onMarketData: (marketData: any) => void;
}

export type IMarketRecorderSymbols = (instrument: InstrumentData[]) => string[];

export interface IMarketProvider
  extends IProvider,
    ITickSubscriber,
    ITickUnsubscriber {
  hasRecorder: () => boolean;

  setRecorder: (
    receiver: IMarketRecorderReceiver,
    symbols: IMarketRecorderSymbols,
  ) => void;

  startRecorder: (instrument: InstrumentData[]) => void;
  stopRecorder: () => void;
}

export type IPlaceOrderResultReceiver = {
  onPlaceOrderSent: (receiptId: string) => void;
  onPlaceOrderError: (reason: string) => void;
};

export type ICancelOrderResultReceiver = {
  onCancelOrderSent: () => void;
  onCancelOrderError: (reason: string) => void;
};

export interface ITraderProvider
  extends IProvider,
    IOrderEmitter,
    IQueryProvider {
  placeOrder: (
    symbol: string,
    offset: OffsetType,
    side: SideType,
    volume: number,
    price: number,
    flag: OrderFlag,
    receiver: IPlaceOrderResultReceiver,
  ) => void;

  cancelOrder: (order: OrderData, receiver: ICancelOrderResultReceiver) => void;
}

export interface IRuntimeEngine
  extends IQueryProvider,
    ITickSubscriber,
    ITickUnsubscriber,
    IBarSubscriber,
    IBarUnsubscriber {
  addStrategy: (strategy: IStrategy) => void;
  removeStrategy: (strategy: IStrategy) => void;

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
    receiver: IPlaceOrderResultReceiver,
  ) => void;

  cancelOrder: (
    strategy: IStrategy,
    order: OrderData,
    receiver: ICancelOrderResultReceiver,
  ) => void;

  buyOpen: (
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    receiver: IPlaceOrderResultReceiver,
  ) => void;

  buyClose: (
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    isToday: boolean,
    receiver: IPlaceOrderResultReceiver,
  ) => void;

  sellOpen: (
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    receiver: IPlaceOrderResultReceiver,
  ) => void;

  sellClose: (
    strategy: IStrategy,
    symbol: string,
    volume: number,
    price: number,
    isToday: boolean,
    receiver: IPlaceOrderResultReceiver,
  ) => void;
}
