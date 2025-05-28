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

export type TapeSide = Readonly<{
  price: number[];
  volume: number[];
}>;

export type OrderBook = Readonly<{
  asks: TapeSide;
  bids: TapeSide;
}>;

export type PriceRange = Readonly<{
  upper: number;
  lower: number;
}>;

export type TickData = Readonly<{
  symbol: string;
  date: number;
  time: number;
  tradingDay: number;
  preOpenInterest: number;
  preClose: number;
  openInterest: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  lastPrice: number;
  volume: number;
  amount: number;
  limits: PriceRange;
  bandings: PriceRange;
  orderBook: OrderBook;
}>;

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

export type TapeData = Readonly<{
  type: TapeType;
  direction: TapeDirection;
  status: TapeStatus;
  interestDelta: number;
  volumeDelta: number;
  amountDelta: number;
}>;

export type PositionCell = Readonly<{
  position: number;
  frozen: number;
}>;

export type PositionSide = Readonly<{
  long: PositionCell;
  short: PositionCell;
}>;

export type PositionData = Readonly<{
  symbol: string;
  today: PositionSide;
  history: PositionSide;
  pending: Readonly<{ long: number; short: number }>;
}>;

export type SideType = "long" | "short";

export type PositionDetail = Readonly<{
  symbol: string;
  date: number;
  side: SideType;
  price: number;
  volume: number;
  margin: number;
}>;

export type OffsetType = "open" | "close" | "close-today";

export type OrderFlag = "limit" | "market";

export type OrderStatus =
  | "submitted"
  | "partially-filled"
  | "filled"
  | "canceled"
  | "rejected";

export type TradeData = Readonly<{
  id: string;
  date: number;
  time: number;
  price: number;
  volume: number;
}>;

export type OrderData = Readonly<{
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
  traded: number;
  status: OrderStatus;
  trades: TradeData[];
  cancelTime?: number;
}>;

export type OrderStatistic = Readonly<{
  symbol: string;
  places: number;
  entrusts: number;
  filleds: number;
  cancels: number;
  rejects: number;
}>;

export type RatioAmount = Readonly<{
  ratio: number;
  amount: number;
}>;

export type CommissionRate = Readonly<{
  symbol: string;
  open: RatioAmount;
  close: RatioAmount;
  closeToday: RatioAmount;
}>;

export type MarginRate = Readonly<{
  symbol: string;
  long: RatioAmount;
  short: RatioAmount;
}>;

export type TradingAccount = Readonly<{
  id: string;
  currency: string;
  preBalance: number;
  preMargin: number;
  balance: number;
  cash: number;
  margin: number;
  commission: number;
  frozenMargin: number;
  frozenCash: number;
  frozenCommission: number;
}>;

export type ProductType = "futures" | "options" | "spot" | "spot-options";
export type OptionsType = "call" | "put";

export type InstrumentData = Readonly<{
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
  strikePrice: number;
  optionsType?: OptionsType;
}>;

export type PriceVolume = Readonly<{
  [price: number]: number;
}>;

export type BarData = Readonly<{
  symbol: string;
  date: number;
  time: number;
  openInterest: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  amount: number;
  delta: number;
  poc: number;
  buyVolumes: PriceVolume;
  sellVolumes: PriceVolume;
}>;

export type Writeable<T> = { -readonly [P in keyof T]: Writeable<T[P]> };
