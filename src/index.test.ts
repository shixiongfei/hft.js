/*
 * index.test.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import process from "node:process";
import fs from "node:fs";
import type { DepthMarketDataField } from "@napi-ctp/types";
import * as hft from "./index.js";

export type Configure = {
  FlowTdPath: string;
  FlowMdPath: string;
  FrontTdAddrs: string[];
  FrontMdAddrs: string[];
  UserInfo: hft.CTPUserInfo;
  Test: { Symbol: string };
};

const config = JSON.parse(
  fs.readFileSync("test.conf.json", "utf8"),
) as Configure;

class Strategy implements hft.IStrategy, hft.ITickReceiver, hft.IBarReceiver {
  private lastTick?: hft.TickData;
  private lastBar?: hft.BarData;
  private engine: hft.IRuntimeEngine;
  readonly symbol = config.Test.Symbol;

  constructor(engine: hft.IRuntimeEngine) {
    this.engine = engine;
  }

  onInit() {
    this.engine.subscribe([this.symbol], this);
    this.engine.subscribeBar([this.symbol], this);

    console.log("Strategy init");
    console.log("Trading Day", this.engine.getTradingDay());

    this.engine.queryInstrument(this.symbol, {
      onInstrument: (instrument) => {
        if (!instrument) {
          console.error("Symbol", this.symbol, "error");
          process.exit(1);
        }

        console.log("Instrument", instrument);
      },
    });

    this.engine.queryCommissionRate(this.symbol, {
      onCommissionRate: (rate) => {
        console.log("Commission Rate", rate);
      },
    });

    this.engine.queryMarginRate(this.symbol, {
      onMarginRate: (rate) => {
        console.log("Margin Rate", rate);
      },
    });

    this.engine.queryTradingAccounts({
      onTradingAccounts: (accounts) => {
        console.log("Trading Accounts", accounts);
      },
    });

    this.engine.queryOrders({
      onOrders: (orders) => {
        console.log("Orders", orders);
      },
    });

    this.engine.queryPositionDetails({
      onPositionDetails: (positionDetails) => {
        console.log("Position Details", positionDetails);
      },
    });

    this.engine.queryPositions({
      onPositions: (positions) => {
        console.log("Positions", positions);
      },
    });

    setTimeout(() => {
      if (!this.lastTick) {
        console.error("Market data is not found");
        return;
      }

      if (this.lastBar) {
        console.log(this.lastBar);
      }

      const price = this.lastTick.orderBook.asks.price[0];

      if (!price) {
        console.error("Invalid price");
        return;
      }

      hft.buyOpen(this.engine, this, this.symbol, 1, price, {
        onPlaceOrderSent: (receiptId) => {
          console.log("Open Place Order Receipt Id", receiptId);
        },

        onPlaceOrderError: (reason) => {
          console.error("Open Place Order Error", reason);
        },
      });
    }, 30 * 1000);
  }

  onDestroy() {
    this.engine.unsubscribeBar([this.symbol], this);
    this.engine.unsubscribe([this.symbol], this);
    console.log("Strategy destroy");
  }

  onRisk(type: hft.RiskType, reason?: string) {
    console.log("Trigger Risk Control", type, reason);
  }

  onEntrust(order: hft.OrderData) {
    console.log("Entrust order", order);
  }

  onTrade(order: hft.OrderData, trade: hft.TradeData) {
    console.log("Order", order, "Traded", trade);

    if (order.status === "filled") {
      setTimeout(() => {
        this.engine.queryPosition(this.symbol, {
          onPosition: (position) => {
            if (!position || !this.lastTick) {
              return;
            }

            const todayLong =
              position.today.long.position - position.today.long.frozen;

            if (todayLong > 0) {
              if (this.lastBar) {
                console.log(this.lastBar);
              }

              hft.sellClose(
                this.engine,
                this,
                this.symbol,
                todayLong,
                0,
                true,
                {
                  onPlaceOrderSent: (receiptId) => {
                    console.log("Close Place Order Receipt Id", receiptId);
                  },

                  onPlaceOrderError: (reason) => {
                    console.error("Close Place Order Error", reason);
                  },
                },
              );
            }
          },
        });
      }, 30 * 1000);
    }
  }

  onCancel(order: hft.OrderData) {
    console.log("Cancel Order", order);
  }

  onReject(order: hft.OrderData) {
    console.log("Reject Order", order);
  }

  onTick(tick: hft.TickData, tape: hft.TapeData) {
    //console.log(tick);
    //console.log(tape);

    this.lastTick = tick;
  }

  onBar(bar: hft.BarData) {
    console.log(bar);

    this.lastBar = bar;
  }
}

const market = hft.createMarket(config.FlowMdPath, config.FrontMdAddrs, {
  listener: {
    onSubscribed: (symbol) => {
      console.log(`Market subscribed: ${symbol}`);
    },

    onUnsubscribed: (symbol) => {
      console.log(`Market unsubscribed: ${symbol}`);
    },
  },
});

const trader = hft.createTrader(
  config.FlowTdPath,
  config.FrontTdAddrs,
  config.UserInfo,
  { fastQueryLastTick: (instrumentId) => market.getLastTick(instrumentId) },
);

const recorder = market.getRecorder();
const enableRecorder = false;

if (enableRecorder && recorder) {
  recorder.setRecorder(
    {
      onMarketData: (marketData: DepthMarketDataField) => {
        console.log(marketData.InstrumentID, marketData.LastPrice);
      },
    },
    (instruments) =>
      instruments
        .filter((instrument) => instrument.productType === "futures")
        .map((instrument) => instrument.symbol),
  );
}

const broker = hft.createBroker(trader, market, {
  onError(error, message) {
    console.error(error, message);
  },
});

broker.addStrategy(new Strategy(broker));

if (!broker.start()) {
  console.error("Broker start failed");
  process.exit(1);
}
