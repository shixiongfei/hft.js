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

import { OrderData, TickData, TradeData } from "./typedef.js";

export interface ILifecycleListener {
  onInit: () => void;
  onUpdate: () => void;
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
