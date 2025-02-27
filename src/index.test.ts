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
  readonly symbol = "rb2505.SHFE";

  onInit(subscriber: hft.ITickSubscriber) {
    subscriber.subscribe([this.symbol], this);
    console.log("Strategy init");
  }

  onDestroy(unsubscriber: hft.ITickUnsubscriber) {
    unsubscriber.unsubscribe([this.symbol], this);
    console.log("Strategy destroy");
  }

  onRisk(type: hft.RiskType, reason?: string) {}

  onEntrust(order: hft.OrderData) {}

  onTrade(order: hft.OrderData, trade: hft.TradeData) {}

  onCancel(order: hft.OrderData) {}

  onReject(order: hft.OrderData) {}

  onTick(tick: hft.TickData) {
    console.log(tick);
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

const broker = hft.createBroker(trader, market, {
  onError(error, message) {
    console.error(error, message);
  },
});

broker.addStrategy(new Strategy());

if (!broker.start()) {
  console.error("Broker start failed");
  exit(1);
}
