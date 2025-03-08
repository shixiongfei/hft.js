/*
 * utils.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

export const parseSymbol = (symbol: string): [string, string] => {
  const [instrumentId, exchangeId] = symbol.split(".");
  return [instrumentId, exchangeId];
};
