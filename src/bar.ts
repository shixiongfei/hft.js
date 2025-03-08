/*
 * bar.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import { BarData, TickData, Writeable } from "./typedef.js";
import { IBarReceiver, ITickReceiver } from "./interfaces.js";

export type BarInfo = Writeable<BarData>;

export class BarGenerator implements ITickReceiver {
  private readonly receivers: IBarReceiver[] = [];

  get isWorking() {
    return this.receivers.length > 0;
  }

  addReceiver(receiver: IBarReceiver) {
    if (!this.receivers.includes(receiver)) {
      this.receivers.push(receiver);
    }
  }

  removeReceiver(receiver: IBarReceiver) {
    const index = this.receivers.indexOf(receiver);

    if (index >= 0) {
      this.receivers.splice(index, 1);
    }
  }

  onTick(tick: TickData) {}
}

export const createBarGenerator = () => new BarGenerator();
