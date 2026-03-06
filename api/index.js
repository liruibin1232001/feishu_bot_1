/**
 * 飞书机器人 - Vercel Serverless 版本
 * 用于接收飞书消息并回复
 */

const axios = require('axios');

// 飞书配置（从环境变量获取）
const APP_ID = process.env.FEISHU_APP_ID || 'cli_a92061f46df89cd5';
const APP_SECRET = process.env.FEISHU_APP_SECRET || 'CmmOZWsPdQI1zeYOam6nZdiqL37GRUyR';

// 用于存储访问令牌
let accessToken = null;
let tokenExpireTime = 0;

// 获取飞书访问令牌
async function getAccessToken() {
  const now = Date.now();

  // 如果已有有效令牌，直接返回
  if (accessToken && now < tokenExpireTime) {
    return accessToken;
  }

  try {
    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: APP_ID,
      app_secret: APP_SECRET
    });

    if (response.data.code === 0) {
      accessToken = response.data.tenant_access_token;
      // 令牌有效期提前5分钟过期，留出缓冲时间
      tokenExpireTime = now + (response.data.expire - 300) * 1000;
      console.log('✓ 成功获取飞书访问令牌');
      return accessToken;
    } else {
      console.error('获取令牌失败:', response.data);
      return null;
    }
  } catch (error) {
    console.error('请求令牌时出错:', error.message);
    return null;
  }
}

// 生成回复内容
async function generateReply(userMessage) {
  // 这里可以接入你的AI服务
  // 目前返回简单的回复示例

  const responses = [
    `你好！我收到了你的消息："${userMessage}"\n\n这是飞书机器人的自动回复测试。`,
    `收到消息：${userMessage}\n\n我可以帮助你完成各种任务，请告诉我你需要什么帮助！`,
    `你说的是："${userMessage}" 对吗？\n\n我可以帮你查资料、写文档、分析数据等。`
  ];

  // 简单随机回复
  return responses[Math.floor(Math.random() * responses.length)];
}

// 发送消息到飞书
async function sendMessage(chat_id, text) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.error('无法获取访问令牌');
      return;
    }

    const response = await axios.post('https://open.feishu.cn/open-apis/im/v1/messages', {
      receive_id: chat_id,
      msg_type: 'text',
      content: JSON.stringify({ text })
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.code === 0) {
      console.log('✓ 消息发送成功');
    } else {
      console.error('发送消息失败:', response.data);
    }
  } catch (error) {
    console.error('发送消息时出错:', error.message);
  }
}

// 处理接收到的消息
async function handleMessage(event) {
  const { message } = event;
  const { chat_id, message_type, content } = message;

  console.log('收到消息:', {
    chat_id,
    message_type,
    content
  });

  // 解析消息内容
  let userMessage = '';
  try {
    const contentObj = JSON.parse(content);
    if (contentObj.text) {
      userMessage = contentObj.text;
    }
  } catch (e) {
    console.error('解析消息内容失败:', e);
  }

  // 如果没有消息内容，直接返回
  if (!userMessage) {
    console.log('消息内容为空，跳过处理');
    return;
  }

  // 生成回复内容
  const replyText = await generateReply(userMessage);

  // 发送回复
  await sendMessage(chat_id, replyText);
}

// Vercel Serverless Function 处理函数
module.exports = async (req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('收到请求:', req.method, req.url);
  console.log('请求体:', JSON.stringify(req.body));

  // 处理GET请求（飞书URL验证）
  if (req.method === 'GET') {
    const { challenge } = req.query;
    if (challenge) {
      res.send(challenge);
      console.log('✓ GET验证通过');
      return;
    }
    res.status(400).send('Invalid request');
    return;
  }

  // 处理POST请求
  if (req.method === 'POST') {
    const { type, event, challenge } = req.body;

    // 处理URL验证
    if (type === 'url_verification') {
      res.json({ challenge });
      console.log('✓ URL验证通过');
      return;
    }

    // 处理消息事件
    if (type === 'event_callback' && event === 'im.message.message_created') {
      const messageEvent = req.body;

      // 异步处理消息，不阻塞响应
      handleMessage(messageEvent).catch(err => {
        console.error('处理消息时出错:', err);
      });
    }

    // 立即返回成功，避免飞书重复发送
    res.json({ code: 0, msg: 'success' });
    return;
  }

  // 其他请求方法
  res.status(405).send('Method not allowed');
};
