require("dotenv").config();
const log4js = require("log4js");
const recording = require("log4js/lib/appenders/recording");
const superagent = require("superagent");
const { CloudClient } = require("cloud189-sdk");

// 配置日志记录
log4js.configure({
    appenders: {
        vcr: { type: "recording" },
        out: {
            type: "console",
            layout: {
                type: "pattern",
                pattern: "\u001b[32m%d{yyyy-MM-dd hh:mm:ss}\u001b[0m - %m"
            }
        }
    },
    categories: { default: { appenders: ["vcr", "out"], level: "info" } }
});

const logger = log4js.getLogger();

// 掩码函数，用于隐藏部分用户名信息
const mask = (s, start, end) => s.split("").fill("*", start, end).join("");

// 执行签到任务
const doTask = async (cloudClient, familyID, threadx, familySignParam) => {
    const result = [];
    const signPromises1 = [];

    let getSpace = ["签到个人云获得(M)"];
    for (let i = 0; i < threadx; i++) {
        signPromises1.push((async () => {
            try {
                const res1 = await cloudClient.userSign();
                if (!res1.isSign) {
                    getSpace.push(` ${res1.netdiskBonus}`);
                }
            } catch (e) {
                getSpace.push(` 0`);
            }
        })());
    }
    await Promise.all(signPromises1);
    if (getSpace.length === 1) getSpace.push(" 0");
    result.push(getSpace.join(""));

    const signPromises2 = [];
    getSpace = ["获得(M)"];
    const { familyInfoResp } = await cloudClient.getFamilyList();
    if (familyInfoResp) {
        const family = familyInfoResp.find((f) => f.familyId === familyID) || familyInfoResp[0];
        result.push(`开始签到家庭云 ID: ${165515815004439}`);
        for (let i = 0; i < threadx; i++) {
            signPromises2.push((async () => {
                try {
                    const res = await cloudClient.familyUserSign(familySignParam);
                    if (!res.signStatus) {
                        getSpace.push(` ${res.bonusSpace}`);
                    }
                } catch (e) {
                    getSpace.push(` 0`);
                }
            })());
        }
        await Promise.all(signPromises2);
        if (getSpace.length === 1) getSpace.push(" 0");
        result.push(getSpace.join(""));
    }
    return result;
};

// 推送消息到 Telegram Bot
const pushTelegramBot = (title, desp, telegramBotToken, telegramBotId) => {
    if (!(telegramBotToken && telegramBotId)) {
        return;
    }
    const data = {
        chat_id: telegramBotId,
        text: `${title}\n\n${desp}`,
    };
    superagent
      .post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`)
      .send(data)
      .timeout(3000)
      .end((err, res) => {
            if (err) {
                logger.error(`TelegramBot推送失败:${JSON.stringify(err)}`);
                return;
            }
            const json = JSON.parse(res.text);
            if (!json.ok) {
                logger.error(`TelegramBot推送失败:${JSON.stringify(json)}`);
            } else {
                logger.info("TelegramBot推送成功");
            }
        });
};

// 推送消息到 WxPusher
const pushWxPusher = (title, desp, WX_PUSHER_APP_TOKEN, WX_PUSHER_UID) => {
    if (!(WX_PUSHER_APP_TOKEN && WX_PUSHER_UID)) {
        return;
    }
    const data = {
        appToken: WX_PUSHER_APP_TOKEN,
        contentType: 1,
        summary: title,
        content: desp,
        uids: [WX_PUSHER_UID],
    };
    superagent
      .post("https://wxpusher.zjiecode.com/api/send/message")
      .send(data)
      .timeout(3000)
      .end((err, res) => {
            if (err) {
                logger.error(`wxPusher推送失败:${JSON.stringify(err)}`);
                return;
            }
            const json = JSON.parse(res.text);
            if (json.data[0].code !== 1000) {
                logger.error(`wxPusher推送失败:${JSON.stringify(json)}`);
            } else {
                logger.info("wxPusher推送成功");
            }
        });
};

// 统一的消息推送函数，调用 Telegram Bot 和 WxPusher 推送
const push = (title, desp, telegramBotToken, telegramBotId, WX_PUSHER_APP_TOKEN, WX_PUSHER_UID) => {
    pushWxPusher(title, desp, WX_PUSHER_APP_TOKEN, WX_PUSHER_UID);
    pushTelegramBot(title, desp, telegramBotToken, telegramBotId);
};

// 从配置文件中获取相关环境变量
const env = require("./env");
let accounts = env.tyys;
let WX_PUSHER_UID = env.WX_PUSHER_UID;
let WX_PUSHER_APP_TOKEN = env.WX_PUSHER_APP_TOKEN;
let telegramBotToken = env.TELEGRAM_BOT_TOKEN;
let telegramBotId = env.TELEGRAM_CHAT_ID;
let threadx = env.threadx; // 进程数
let familySignParam = env.FAMILY_SIGN_PARAM; // 家庭签到参数

const main = async () => {
    accounts = accounts.split(/[\n ]/);

    let mainUserName, mainPassword;
    let pushLog = [];

    for (let i = 0; i < accounts.length; i += 2) {
        const [userName, password] = accounts.slice(i, i + 2);
        if (!userName || !password) continue;

        const userNameInfo = mask(userName, 3, 7);
        const accountIndex = (i / 2) + 1;

        try {
            const cloudClient = new CloudClient(userName, password);

            logger.log(`${accountIndex}.账户 ${userNameInfo} 开始执行`);
            await cloudClient.login();
            const { cloudCapacityInfo: cloudCapacityInfo0, familyCapacityInfo: familyCapacityInfo0 } = await cloudClient.getUserSizeInfo();
            await doTask(cloudClient, env.FAMILY_ID, threadx, familySignParam);
            const { cloudCapacityInfo, familyCapacityInfo } = await cloudClient.getUserSizeInfo();

            const personalChange = (cloudCapacityInfo.totalSize - cloudCapacityInfo0.totalSize) / 1024 / 1024;
            const familyChange = (familyCapacityInfo.totalSize - familyCapacityInfo0.totalSize) / 1024 / 1024;

            const line = `账户${String(accountIndex).padStart(2, '0')}：实际 个人+ ${String(personalChange.toFixed(0)).padStart(3, ' ')}M, 家庭+ ${String(familyChange.toFixed(0)).padStart(3, ' ')}M`;
            pushLog.push(line);

            if (accountIndex === 20) {
                mainUserName = userName;
                mainPassword = password;
            }
        } catch (e) {
            logger.error(e);
            if (e.code === "ETIMEDOUT") throw e;
        } finally {
            logger.log("");
        }
    }

    if (mainUserName && mainPassword) {
        const cloudClient = new CloudClient(mainUserName, mainPassword);
        await cloudClient.login();
        const { cloudCapacityInfo, familyCapacityInfo } = await cloudClient.getUserSizeInfo();
        const personalTotal = (cloudCapacityInfo.totalSize / 1024 / 1024 / 1024).toFixed(0);
        const familyTotal = (familyCapacityInfo.totalSize / 1024 / 1024 / 1024).toFixed(0);
        const personalChange = (cloudCapacityInfo.totalSize - cloudCapacityInfo.usedSize) / 1024 / 1024;
        const familyChange = (familyCapacityInfo.totalSize - familyCapacityInfo.usedSize) / 1024 / 1024;

        const indent = " ".repeat(10);
        const mainLine1 = `主帐号：个人总容量${String(personalTotal).padStart(3, ' ')}G（个人+${String(personalChange.toFixed(0)).padStart(3, ' ')}M）`;
        const mainLine2 = `${indent}家庭总容量${String(familyTotal).padStart(3, ' ')}G（家庭+${String(familyChange.toFixed(0)).padStart(3, ' ')}M）`;
        pushLog.push(mainLine1);
        pushLog.push(mainLine2);
    }

    return pushLog.join('\n');
};

(async () => {
    try {
        const pushContent = await main();
        push("天翼云盘自动签到任务", pushContent, telegramBotToken, telegramBotId, WX_PUSHER_APP_TOKEN, WX_PUSHER_UID);
    } finally {
        const events = recording.replay();
        const content = events.map((e) => `${e.data.join("")}`).join("  \n");
        recording.erase();
    }
})();
