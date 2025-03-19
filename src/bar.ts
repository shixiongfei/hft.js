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

import { BarData, TapeData, TickData, Writeable } from "./typedef.js";
import { IBarReceiver, ITickReceiver } from "./interfaces.js";
import { getBarVolume } from "./utils.js";

export type BarInfo = Writeable<BarData>;

export class BarGenerator implements ITickReceiver {
  private readonly receivers: IBarReceiver[];
  private readonly symbol: string;
  private readonly maxVolume: number;
  private shouldUpdate: number;
  private bar?: BarInfo;

  constructor(symbol: string, maxVolume = 0) {
    this.receivers = [];
    this.symbol = symbol;
    this.maxVolume = maxVolume;
    this.shouldUpdate = 0;
  }

  get isWorking() {
    return this.receivers.length > 0;
  }

  addReceiver(receiver: IBarReceiver) {
    if (!this.receivers.includes(receiver)) {
      if (receiver.onUpdateBar) {
        this.shouldUpdate += 1;
      }

      this.receivers.push(receiver);
    }
  }

  removeReceiver(receiver: IBarReceiver) {
    const index = this.receivers.indexOf(receiver);

    if (index >= 0) {
      if (receiver.onUpdateBar) {
        this.shouldUpdate -= 1;
      }

      this.receivers.splice(index, 1);
    }
  }

  onTick(tick: TickData, tape: TapeData) {
    if (tick.symbol !== this.symbol) {
      return;
    }

    const date = tick.date;

    const time =
      this.maxVolume > 0 ? tick.time : Math.floor(tick.time / 100) * 100;

    if (this.bar) {
      const isFinished =
        this.maxVolume > 0
          ? this.bar.volume >= this.maxVolume
          : this.bar.date !== date || this.bar.time !== time;

      if (isFinished) {
        const bar = Object.freeze(this.bar);

        Object.freeze(bar.buyVolumes);
        Object.freeze(bar.sellVolumes);

        this.receivers.forEach((receiver) => receiver.onBar(bar));
        this.bar = undefined;
      }
    }

    if (tape.volumeDelta === 0) {
      return;
    }

    if (!this.bar) {
      this.bar = this._createBar(date, time, tick);
    }

    this.bar.openInterest = tick.openInterest;
    this.bar.closePrice = tick.lastPrice;

    this.bar.highPrice = Math.max(this.bar.highPrice, tick.lastPrice);
    this.bar.lowPrice = Math.min(this.bar.lowPrice, tick.lastPrice);

    this.bar.volume += tape.volumeDelta;
    this.bar.amount += tape.amountDelta;

    switch (tape.direction) {
      case "up":
        if (tick.lastPrice in this.bar.buyVolumes) {
          this.bar.buyVolumes[tick.lastPrice] += tape.volumeDelta;
        } else {
          this.bar.buyVolumes[tick.lastPrice] = tape.volumeDelta;
        }

        this.bar.delta += tape.volumeDelta;
        break;

      case "down":
        if (tick.lastPrice in this.bar.sellVolumes) {
          this.bar.sellVolumes[tick.lastPrice] += tape.volumeDelta;
        } else {
          this.bar.sellVolumes[tick.lastPrice] = tape.volumeDelta;
        }

        this.bar.delta -= tape.volumeDelta;
        break;
    }

    if (tick.lastPrice !== this.bar.poc && tape.direction !== "none") {
      const tickVP = getBarVolume(this.bar, tick.lastPrice);
      const pocVP = getBarVolume(this.bar, this.bar.poc);

      if (tickVP > pocVP) {
        this.bar.poc = tick.lastPrice;
      }
    }

    if (this.shouldUpdate > 0) {
      const bar: BarData = Object.freeze({
        ...this.bar,
        buyVolumes: Object.freeze({ ...this.bar.buyVolumes }),
        sellVolumes: Object.freeze({ ...this.bar.sellVolumes }),
      });

      this.receivers.forEach((receiver) => {
        if (receiver.onUpdateBar) {
          receiver.onUpdateBar(bar, tick, tape);
        }
      });
    }
  }

  private _createBar(date: number, time: number, tick: TickData): BarInfo {
    return {
      symbol: this.symbol,
      date: date,
      time: time,
      openInterest: tick.openInterest,
      openPrice: tick.lastPrice,
      highPrice: tick.lastPrice,
      lowPrice: tick.lastPrice,
      closePrice: tick.lastPrice,
      volume: 0,
      amount: 0,
      delta: 0,
      poc: tick.lastPrice,
      buyVolumes: {},
      sellVolumes: {},
    };
  }
}

export const createBarGenerator = (symbol: string, maxVolume = 0) =>
  new BarGenerator(symbol, maxVolume);
