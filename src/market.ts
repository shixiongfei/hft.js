/*
 * market.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import ctp from "napi-ctp";
import { CTPProvider } from "./provider.js";
import { InstrumentData, OrderBook, TickData } from "./typedef.js";
import { calcTapeData } from "./tape.js";
import { parseSymbol } from "./utils.js";
import {
  ILifecycleListener,
  IMarketProvider,
  IMarketRecorderReceiver,
  IMarketRecorderSymbols,
  ITickReceiver,
} from "./interfaces.js";

const isValidPrice = (x: number) => x !== Number.MAX_VALUE && x !== 0;
const isValidVolume = (x: number) => x !== Number.MAX_VALUE && x !== 0;

export class Market extends CTPProvider implements IMarketProvider {
  private marketApi?: ctp.MarketData;
  private recorder?: IMarketRecorderReceiver;
  private recorderSymbols?: IMarketRecorderSymbols;
  private tradingDay: number;
  private readonly recordings: Set<string>;
  private readonly symbols: Map<string, string>;
  private readonly lastTicks: Map<string, TickData>;
  private readonly subscribers: Map<string, ITickReceiver[]>;

  constructor(flowMdPath: string, frontMdAddrs: string | string[]) {
    super(flowMdPath, frontMdAddrs);
    this.tradingDay = 0;
    this.recordings = new Set();
    this.symbols = new Map();
    this.lastTicks = new Map();
    this.subscribers = new Map();
  }

  hasRecorder() {
    return !!this.recorder;
  }

  setRecorder(
    receiver: IMarketRecorderReceiver,
    symbols: IMarketRecorderSymbols,
  ) {
    this.recorder = receiver;
    this.recorderSymbols = symbols;
  }

  open(lifecycle: ILifecycleListener) {
    if (this.marketApi) {
      return true;
    }

    this.marketApi = ctp.createMarketData(this.flowPath, this.frontAddrs);

    this.marketApi.on(ctp.MarketDataEvent.FrontConnected, () => {
      this._withRetry(() => this.marketApi!.reqUserLogin());
    });

    let fired = false;

    this.marketApi.on<ctp.RspUserLoginField>(
      ctp.MarketDataEvent.RspUserLogin,
      (_, options) => {
        if (this._isErrorResp(lifecycle, options, "login-error")) {
          return;
        }

        const tradingDay = parseInt(this.marketApi!.getTradingDay());

        if (this.tradingDay !== tradingDay) {
          this.lastTicks.clear();
          this.tradingDay = tradingDay;
        }

        const instrumentIds = new Set([
          ...Array.from(this.recordings),
          ...Object.keys(this.subscribers),
        ]);

        if (instrumentIds.size > 0) {
          this._withRetry(() =>
            this.marketApi!.subscribeMarketData(Array.from(instrumentIds)),
          );
        }

        if (!fired) {
          fired = true;
          lifecycle.onOpen();
        }
      },
    );

    this.marketApi.on<ctp.DepthMarketDataField>(
      ctp.MarketDataEvent.RtnDepthMarketData,
      (depthMarketData) => {
        const instrumentId = depthMarketData.InstrumentID;

        if (this.recorder && this.recordings.has(instrumentId)) {
          this.recorder.onMarketData(depthMarketData);
        }

        const symbol = this.symbols.get(instrumentId);

        if (!symbol) {
          return;
        }

        const orderBook: OrderBook = {
          asks: { price: [], volume: [] },
          bids: { price: [], volume: [] },
        };

        if (
          isValidPrice(depthMarketData.AskPrice1) &&
          isValidVolume(depthMarketData.AskVolume1)
        ) {
          orderBook.asks.price.push(depthMarketData.AskPrice1);
          orderBook.asks.volume.push(depthMarketData.AskVolume1);

          if (
            isValidPrice(depthMarketData.AskPrice2) &&
            isValidVolume(depthMarketData.AskVolume2)
          ) {
            orderBook.asks.price.push(depthMarketData.AskPrice2);
            orderBook.asks.volume.push(depthMarketData.AskVolume2);

            if (
              isValidPrice(depthMarketData.AskPrice3) &&
              isValidVolume(depthMarketData.AskVolume3)
            ) {
              orderBook.asks.price.push(depthMarketData.AskPrice3);
              orderBook.asks.volume.push(depthMarketData.AskVolume3);

              if (
                isValidPrice(depthMarketData.AskPrice4) &&
                isValidVolume(depthMarketData.AskVolume4)
              ) {
                orderBook.asks.price.push(depthMarketData.AskPrice4);
                orderBook.asks.volume.push(depthMarketData.AskVolume4);

                if (
                  isValidPrice(depthMarketData.AskPrice5) &&
                  isValidVolume(depthMarketData.AskVolume5)
                ) {
                  orderBook.asks.price.push(depthMarketData.AskPrice5);
                  orderBook.asks.volume.push(depthMarketData.AskVolume5);
                }
              }
            }
          }
        }

        if (
          isValidPrice(depthMarketData.BidPrice1) &&
          isValidVolume(depthMarketData.BidVolume1)
        ) {
          orderBook.bids.price.push(depthMarketData.BidPrice1);
          orderBook.bids.volume.push(depthMarketData.BidVolume1);

          if (
            isValidPrice(depthMarketData.BidPrice2) &&
            isValidVolume(depthMarketData.BidVolume2)
          ) {
            orderBook.bids.price.push(depthMarketData.BidPrice2);
            orderBook.bids.volume.push(depthMarketData.BidVolume2);

            if (
              isValidPrice(depthMarketData.BidPrice3) &&
              isValidVolume(depthMarketData.BidVolume3)
            ) {
              orderBook.bids.price.push(depthMarketData.BidPrice3);
              orderBook.bids.volume.push(depthMarketData.BidVolume3);

              if (
                isValidPrice(depthMarketData.BidPrice4) &&
                isValidVolume(depthMarketData.BidVolume4)
              ) {
                orderBook.bids.price.push(depthMarketData.BidPrice4);
                orderBook.bids.volume.push(depthMarketData.BidVolume4);

                if (
                  isValidPrice(depthMarketData.BidPrice5) &&
                  isValidVolume(depthMarketData.BidVolume5)
                ) {
                  orderBook.bids.price.push(depthMarketData.BidPrice5);
                  orderBook.bids.volume.push(depthMarketData.BidVolume5);
                }
              }
            }
          }
        }

        const time = this._parseTime(depthMarketData.UpdateTime);

        const tick: TickData = Object.freeze({
          symbol: symbol,
          date: parseInt(depthMarketData.ActionDay),
          time: time + depthMarketData.UpdateMillisec / 1000,
          tradingDay: parseInt(depthMarketData.TradingDay),
          preOpenInterest: depthMarketData.PreOpenInterest,
          preClose: depthMarketData.PreClosePrice,
          openInterest: depthMarketData.OpenInterest,
          openPrice: depthMarketData.OpenPrice,
          highPrice: depthMarketData.HighestPrice,
          lowPrice: depthMarketData.LowestPrice,
          lastPrice: depthMarketData.LastPrice,
          volume: depthMarketData.Volume,
          amount: depthMarketData.Turnover,
          limits: Object.freeze({
            upper: depthMarketData.UpperLimitPrice,
            lower: depthMarketData.LowerLimitPrice,
          }),
          bandings: Object.freeze({
            upper: depthMarketData.BandingUpperPrice,
            lower: depthMarketData.BandingLowerPrice,
          }),
          orderBook: Object.freeze(orderBook),
        });

        const receivers = this.subscribers.get(instrumentId);

        if (receivers && receivers.length > 0) {
          const lastTick = this.lastTicks.get(instrumentId);
          const tape = calcTapeData(tick, lastTick);

          receivers.forEach((receiver) => receiver.onTick(tick, tape));
        }

        this.lastTicks.set(instrumentId, tick);
      },
    );

    return true;
  }

  close(lifecycle: ILifecycleListener) {
    if (!this.marketApi) {
      return;
    }

    this.marketApi.close();
    this.marketApi = undefined;

    lifecycle.onClose();
  }

  startRecorder(instrument: InstrumentData[]) {
    if (!this.recorderSymbols) {
      return;
    }

    const symbols = this.recorderSymbols(instrument);
    const instrumentIds = new Set<string>();

    symbols.forEach((symbol) => {
      const [instrumentId] = parseSymbol(symbol);

      if (this.recordings.has(instrumentId)) {
        return;
      }

      this.recordings.add(instrumentId);

      if (!this.subscribers.has(instrumentId)) {
        this.symbols.set(instrumentId, symbol);
        instrumentIds.add(instrumentId);
      }
    });

    if (instrumentIds.size > 0) {
      this._withRetry(() =>
        this.marketApi?.subscribeMarketData(Array.from(instrumentIds)),
      );
    }
  }

  stopRecorder() {
    if (this.recordings.size === 0) {
      return;
    }

    const instrumentIds = new Set<string>();

    this.recordings.forEach((instrumentId) => {
      if (!this.subscribers.has(instrumentId)) {
        this.symbols.delete(instrumentId);
        instrumentIds.add(instrumentId);
      }
    });

    this.recordings.clear();

    if (instrumentIds.size > 0) {
      this._withRetry(() =>
        this.marketApi?.unsubscribeMarketData(Array.from(instrumentIds)),
      );
    }
  }

  subscribe(symbols: string[], receiver: ITickReceiver) {
    const instrumentIds = new Set<string>();

    symbols.forEach((symbol) => {
      const [instrumentId] = parseSymbol(symbol);
      const receivers = this.subscribers.get(instrumentId);

      if (receivers) {
        if (!receivers.includes(receiver)) {
          receivers.push(receiver);
        }
      } else {
        this.subscribers.set(instrumentId, [receiver]);

        if (!this.recordings.has(instrumentId)) {
          this.symbols.set(instrumentId, symbol);
          instrumentIds.add(instrumentId);
        }
      }
    });

    if (instrumentIds.size > 0) {
      this._withRetry(() =>
        this.marketApi?.subscribeMarketData(Array.from(instrumentIds)),
      );
    }
  }

  unsubscribe(symbols: string[], receiver: ITickReceiver) {
    const instrumentIds = new Set<string>();

    symbols.forEach((symbol) => {
      const [instrumentId] = parseSymbol(symbol);
      const receivers = this.subscribers.get(instrumentId);

      if (!receivers) {
        return;
      }

      if (receivers.length > 0) {
        const index = receivers.indexOf(receiver);

        if (index < 0) {
          return;
        }

        receivers.splice(index, 1);
      }

      if (receivers.length === 0) {
        this.subscribers.delete(instrumentId);

        if (!this.recordings.has(instrumentId)) {
          this.symbols.delete(instrumentId);
          instrumentIds.add(instrumentId);
        }
      }
    });

    if (instrumentIds.size > 0) {
      this._withRetry(() =>
        this.marketApi?.unsubscribeMarketData(Array.from(instrumentIds)),
      );
    }
  }
}

export const createMarket = (
  flowMdPath: string,
  frontMdAddrs: string | string[],
) => new Market(flowMdPath, frontMdAddrs);
