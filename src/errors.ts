/*
 * errors.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

export type LoginError = Readonly<{
  code: "login-error";
  message: string;
}>;

export type QueryOrderError = Readonly<{
  code: "query-order-error";
  message: string;
}>;

export type QueryTradeError = Readonly<{
  code: "query-trade-error";
  message: string;
}>;

export type QueryInstrumentError = Readonly<{
  code: "query-instrument-error";
  message: string;
}>;

export type PlaceOrderError = Readonly<{
  code: "place-order-error";
  receiptId: string;
  message: string;
}>;

export type CancelOrderError = Readonly<{
  code: "cancel-order-error";
  receiptId: string;
  message: string;
}>;

export type ProviderErrors =
  | LoginError
  | QueryOrderError
  | QueryTradeError
  | QueryInstrumentError;

export type OrderErrors = PlaceOrderError | CancelOrderError;

export type Errors = ProviderErrors | OrderErrors;
