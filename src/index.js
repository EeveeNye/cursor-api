const express = require('express')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const { stringToHex, chunkToUtf8String } = require('./utils.js')
require('dotenv').config()
const app = express()

// 中间件配置
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.post('/v1/chat/completions', async (req, res) => {
  console.log('收到请求:', {
    model: req.body.model,
    messages: req.body.messages,
    stream: req.body.stream,
    headers: req.headers
  })

  let currentKeyIndex = 0
  try {
    const { model, messages, stream = false } = req.body
    let authToken = req.headers.authorization?.replace('Bearer ', '')
    
    console.log('处理前的Token:', authToken)
    
    const keys = authToken.split(',').map(key => key.trim())
    if (keys.length > 0) {
      authToken = keys[currentKeyIndex]
      currentKeyIndex = (currentKeyIndex + 1)
      console.log('处理后的Token:', authToken)
    }

    if (authToken && authToken.includes('%3A%3A')) {
      authToken = authToken.split('%3A%3A')[1]
      console.log('最终使用的Token:', authToken)
    }

    const formattedMessages = messages.map(msg => `${msg.role}:${msg.content}`).join('\n')
    const hexData = stringToHex(formattedMessages, model)
    
    console.log('准备发送请求到Cursor API:', {
      formattedMessages,
      model,
      stream
    })

    const response = await fetch('https://api2.cursor.sh/aiserver.v1.AiService/StreamChat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/connect+proto',
        authorization: `Bearer ${authToken}`,
        'connect-accept-encoding': 'gzip,br',
        'connect-protocol-version': '1',
        'user-agent': 'connect-es/1.4.0',
        'x-amzn-trace-id': `Root=${uuidv4()}`,
        'x-cursor-checksum': 'zo6Qjequ9b9734d1f13c3438ba25ea31ac93d9287248b9d30434934e9fcbfa6b3b22029e/7e4af391f67188693b722eff0090e8e6608bca8fa320ef20a0ccb5d7d62dfdef',
        'x-cursor-client-version': '0.42.3',
        'x-cursor-timezone': 'Asia/Shanghai',
        'x-ghost-mode': 'false',
        'x-request-id': uuidv4(),
        Host: 'api2.cursor.sh'
      },
      body: hexData
    })

    console.log('Cursor API 响应:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers)
    })

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const responseId = `chatcmpl-${uuidv4()}`
      let isFirstChunk = true

      for await (const chunk of response.body) {
        const text = chunkToUtf8String(chunk)
        let cleanedText = text
        // .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F]/g, '').trim()

        // if (isFirstChunk) {
        //   cleanedText = cleanedText.replace(/^P/, '')
        //   isFirstChunk = false
        // }

        // console.log('收到流式数据(清理后):', cleanedText)

        if (cleanedText.length > 0) {
          const eventData = JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: {
                content: cleanedText
              }
            }]
          })
          res.write(`data: ${eventData}\n\n`)
        }
      }

      console.log('流式响应完成')
      res.write('data: [DONE]\n\n')
      return res.end()
    } else {
      let text = ''
      // 在非流模式下也使用封装的函数
      for await (const chunk of response.body) {
        text += chunkToUtf8String(chunk)
      }
      // 对解析后的字符串进行进一步处理
      text = text.replace(/^.*<\|END_USER\|>/s, '')
      text = text.replace(/^\n[a-zA-Z]?/, '').trim()
      console.log(text)

      return res.json({
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: text
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      })
    }
  } catch (error) {
    console.error('详细错误信息:', error)
    console.error('错误堆栈:', error.stack)
    if (!res.headersSent) {
      if (req.body.stream) {
        const errorResponse = JSON.stringify({ error: 'Internal server error', details: error.message })
        console.log('发送错误响应:', errorResponse)
        res.write(`data: ${errorResponse}\n\n`)
        return res.end()
      } else {
        return res.status(500).json({ error: 'Internal server error', details: error.message })
      }
    }
  }
})

// 启动服务器
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`)
})
