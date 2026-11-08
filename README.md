# dsh-Social Trace

DeepSeek Harness 的本地社交动态监控插件，支持微博和雪球。

## 功能

- 可视化监控流向，按平台、博主独立启停。
- 定时检查新动态，按日期缓存历史消息，支持断点续传。
- 按平台和博主保存正文、转发及图片，支持搜索和 Markdown / JSONL 导出。
- 通过 dsh-im 向 QQ、微信等多个接收目标推送消息。
- 内置版本检查；通过 npm 安装的插件支持一键更新。

## 安装

需要 DeepSeek Harness 桌面版、Google Chrome 和 Node.js 22.19 或以上。

在源码目录执行：

```sh
npm ci
dsh plugin --profile desktop add .
```

重新打开 Harness，在侧栏进入 Social Trace。

## 开始使用

1. 在「连接与设置」选择信息保存位置，登录对应平台。
2. 添加博主主页链接或 UID，选择从现在记录或缓存历史消息。
3. 点击大屏节点齿轮，配置监控时间、频率及历史缓存范围。
4. 如需推送，在 dsh-im 配好机器人和接收目标，再从大屏 dsh-im 节点添加渠道并开启推送。

## 说明

监控需要电脑唤醒且插件运行。重新启动后会补查期间仍可见的动态；已删除或无权访问的内容无法补存。平台要求登录或验证时会暂停采集，处理后可继续。雪球文章仅保存标题和原文链接。

## 许可

[MIT](LICENSE)。平台标识的权利说明见 [assets/NOTICE.md](assets/NOTICE.md)。
