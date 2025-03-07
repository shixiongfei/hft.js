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

import fs from "node:fs";
import { exit } from "node:process";
import ctp from "napi-ctp";
import * as hft from ".";

export type Configure = {
  FlowTdPath: string;
  FlowMdPath: string;
  FrontTdAddrs: string[];
  FrontMdAddrs: string[];
  UserInfo: hft.CTPUserInfo;
};

const existsFile = (filename: string) => {
  try {
    fs.accessSync(filename);
    return true;
  } catch {
    return false;
  }
};

const config = JSON.parse(
  fs.readFileSync("test.conf.json", "utf8"),
) as Configure;

if (!existsFile(config.FlowTdPath)) {
  fs.mkdirSync(config.FlowTdPath, { recursive: true });
}

if (!existsFile(config.FlowMdPath)) {
  fs.mkdirSync(config.FlowMdPath, { recursive: true });
}

class Strategy implements hft.IStrategy, hft.ITickReceiver {
  private lastTick?: hft.TickData;
  private engine: hft.IRuntimeEngine;
  readonly symbol = "sc2504.INE";

  constructor(engine: hft.IRuntimeEngine) {
    this.engine = engine;
  }

  onInit(subscriber: hft.ITickSubscriber) {
    subscriber.subscribe([this.symbol], this);
    console.log("Strategy init");

    setTimeout(() => {
      if (!this.lastTick) {
        console.error("Market data is not found");
        return;
      }

      this.engine.placeOrder(
        this,
        this.symbol,
        "open",
        "long",
        1,
        this.lastTick.orderBook.asks.price[0],
        "limit",
        {
          onPlaceOrderSent(receiptId) {
            console.log("Open Place Order Receipt Id", receiptId);
          },

          onPlaceOrderError(reason) {
            console.error("Open Place Order Error", reason);
          },
        },
      );
    }, 30 * 1000);
  }

  onDestroy(unsubscriber: hft.ITickUnsubscriber) {
    unsubscriber.unsubscribe([this.symbol], this);
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
  }

  onFinish(order: hft.OrderData) {
    console.log("Finish Order", order);

    setTimeout(() => {
      const symbol = this.symbol;
      const engine = this.engine;
      const strategy = this;
      const lastTick = this.lastTick;

      this.engine.queryPosition(this.symbol, {
        onPosition(position) {
          if (!position || !lastTick) {
            return;
          }

          const todayLong =
            position.long.today.position - position.long.today.frozen;

          if (todayLong > 0) {
            engine.placeOrder(
              strategy,
              symbol,
              "close-today",
              "short",
              todayLong,
              lastTick.orderBook.bids.price[0],
              "limit",
              {
                onPlaceOrderSent(receiptId) {
                  console.log("Close Place Order Receipt Id", receiptId);
                },

                onPlaceOrderError(reason) {
                  console.error("Close Place Order Error", reason);
                },
              },
            );
          }
        },
      });
    }, 30 * 1000);
  }

  onCancel(order: hft.OrderData) {
    console.log("Cancel Order", order);
  }

  onReject(order: hft.OrderData) {
    console.log("Reject Order", order);
  }

  onTick(tick: hft.TickData) {
    const tape = hft.calcTapeData(tick, this.lastTick);

    //console.log(tick);
    //console.log(tape);

    this.lastTick = tick;
  }
}

const trader = hft.createTrader(
  config.FlowTdPath,
  config.FrontTdAddrs,
  config.UserInfo,
);

const market = hft.createMarket(
  config.FlowMdPath,
  config.FrontMdAddrs,
  config.UserInfo,
);

const enableRecorder = false;

if (enableRecorder) {
  market.setRecorder(
    {
      onMarketData(marketData: ctp.DepthMarketDataField) {
        console.log(marketData.InstrumentID, marketData.LastPrice);
      },
    },
    (instruments) =>
      instruments
        .filter((instrument) => instrument.productType === "future")
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
  exit(1);
}
