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

type TapeSide = {
  price: number[];
  volume: number[];
};

type OrderBook = {
  asks: TapeSide;
  bids: TapeSide;
};

type TickData = {
  symbol: string;
  date: number;
  time: number;
  openInterest: number;
  price: number;
  volume: number;
  orderBook: OrderBook;
};

type PriceRange = {
  upper: number;
  lower: number;
};

type PriceVolume = {
  [price: number]: number;
};

type MarketData = {
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
  price: number;
  volume: number;
  amount: number;
  buyVolume: PriceVolume;
  sellVolume: PriceVolume;
  lastTick: TickData;
  limits: PriceRange;
  bandings: PriceRange;
};

type PositionCell = {
  position: number;
  frozen: number;
};

type PositionSide = {
  today: PositionCell;
  history: PositionCell;
  pending: number;
};

type SideType = "long" | "short";

type PositionDetail = {
  symbol: string;
  date: number;
  side: SideType;
  price: number;
  volume: number;
  margin: number;
};

type PositionData = {
  symbol: string;
  long: PositionSide;
  short: PositionSide;
  details: PositionDetail;
};

type OffsetType = "open" | "close" | "close-today";

type OrderType = "limit";

type OrderStatus =
  | "submitted"
  | "partially-filled"
  | "filled"
  | "canceled"
  | "rejected";

type TradeData = {
  id: string;
  orderId: string;
  symbol: string;
  date: number;
  time: number;
  side: SideType;
  offset: OffsetType;
  price: number;
  volume: number;
};

type OrderData = {
  id: string;
  receiptId: string;
  symbol: string;
  type: OrderType;
  side: SideType;
  offset: OffsetType;
  price: number;
  volume: number;
  status: OrderStatus;
  trades: TradeData[];
  cancelTime?: number;
};

type OrderStatistic = {
  symbol: string;
  places: number;
  entrusts: number;
  trades: number;
  cancels: number;
  rejects: number;
};

type RatioAmount = {
  ratio: number;
  amount: number;
};

type CommissionRate = {
  symbol: string;
  open: RatioAmount;
  close: RatioAmount;
  closeToday: RatioAmount;
};

type MarginRate = {
  symbol: string;
  long: RatioAmount;
  short: RatioAmount;
};

type TradingAccount = {
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

type ProductType = "future" | "option";

type InstrumentData = {
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
