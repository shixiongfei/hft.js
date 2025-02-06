/*
 * typedef.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

export type TapeSide = {
  price: number[];
  volume: number[];
};

export type OrderBook = {
  asks: TapeSide;
  bids: TapeSide;
};

export type TickData = {
  symbol: string;
  date: number;
  time: number;
  openInterest: number;
  price: number;
  volume: number;
  amount: number;
  orderBook: OrderBook;
};

export type TapeType =
  | "open"
  | "close"
  | "dual-open"
  | "dual-close"
  | "turnover"
  | "no-deal";

export type TapeDirection = "up" | "down" | "none";

export type TapeStatus =
  | "open-long"
  | "open-short"
  | "close-short"
  | "close-long"
  | "turnover-long"
  | "turnover-short"
  | "dual-open"
  | "dual-close"
  | "invalid";

export type TapeData = {
  symbol: string;
  date: number;
  time: number;
  volumeDelta: number;
  interestDelta: number;
  type: TapeType;
  direction: TapeDirection;
  status: TapeStatus;
};

export type PriceRange = {
  upper: number;
  lower: number;
};

export type PriceVolume = {
  [price: number]: number;
};

export type MarketData = {
  symbol: string;
  tradingDay: number;
  date: number;
  time: number;
  preOpenInterest: number;
  preClose: number;
  openInterest: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  lastTick: TickData;
  buyVolume: PriceVolume;
  sellVolume: PriceVolume;
  limits: PriceRange;
  bandings: PriceRange;
};

export type PositionCell = {
  position: number;
  frozen: number;
};

export type PositionSide = {
  today: PositionCell;
  history: PositionCell;
  pending: number;
};

export type SideType = "long" | "short";

export type PositionDetail = {
  symbol: string;
  date: number;
  side: SideType;
  price: number;
  volume: number;
  margin: number;
};

export type PositionData = {
  symbol: string;
  long: PositionSide;
  short: PositionSide;
  details: PositionDetail[];
};

export type OffsetType = "open" | "close" | "close-today";

export type OrderFlag = "limit";

export type OrderStatus =
  | "submitted"
  | "partially-filled"
  | "filled"
  | "canceled"
  | "rejected";

export type TradeData = {
  id: string;
  date: number;
  time: number;
  price: number;
  volume: number;
};

export type OrderData = {
  id: string;
  receiptId: string;
  symbol: string;
  date: number;
  time: number;
  flag: OrderFlag;
  side: SideType;
  offset: OffsetType;
  price: number;
  volume: number;
  status: OrderStatus;
  trades: TradeData[];
  cancelTime?: number;
};

export type OrderStatistic = {
  symbol: string;
  places: number;
  entrusts: number;
  trades: number;
  cancels: number;
  rejects: number;
};

export type RatioAmount = {
  ratio: number;
  amount: number;
};

export type CommissionRate = {
  symbol: string;
  open: RatioAmount;
  close: RatioAmount;
  closeToday: RatioAmount;
};

export type MarginRate = {
  symbol: string;
  long: RatioAmount;
  short: RatioAmount;
};

export type TradingAccount = {
  id: string;
  currency: string;
  preBalance: number;
  balance: number;
  cash: number;
  margin: number;
  commission: number;
  frozenMargin: number;
  frozenCash: number;
  frozenCommission: number;
};

export type ProductType = "future" | "option";

export type InstrumentData = {
  symbol: string;
  id: string;
  name: string;
  exchangeId: string;
  productId: string;
  productType: ProductType;
  deliveryTime: number;
  createDate: number;
  openDate: number;
  expireDate: number;
  multiple: number;
  priceTick: number;
  maxLimitOrderVolume: number;
  minLimitOrderVolume: number;
};
