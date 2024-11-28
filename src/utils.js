// Helper function to convert string to hex bytes
function stringToHex (str, modelName) {
  const bytes = Buffer.from(str, 'utf-8')
  const byteLength = bytes.length

  // Calculate lengths and fields similar to Python version
  const FIXED_HEADER = 2
  const SEPARATOR = 1
  const FIXED_SUFFIX_LENGTH = 0xA3 + modelName.length

  // 计算文本长度字段 (类似 Python 中的 base_length1)
  let textLengthField1, textLengthFieldSize1
  if (byteLength < 128) {
    textLengthField1 = byteLength.toString(16).padStart(2, '0')
    textLengthFieldSize1 = 1
  } else {
    const lowByte1 = (byteLength & 0x7F) | 0x80
    const highByte1 = (byteLength >> 7) & 0xFF
    textLengthField1 = lowByte1.toString(16).padStart(2, '0') + highByte1.toString(16).padStart(2, '0')
    textLengthFieldSize1 = 2
  }

  // 计算基础长度 (类似 Python 中的 base_length)
  const baseLength = byteLength + 0x2A
  let textLengthField, textLengthFieldSize
  if (baseLength < 128) {
    textLengthField = baseLength.toString(16).padStart(2, '0')
    textLengthFieldSize = 1
  } else {
    const lowByte = (baseLength & 0x7F) | 0x80
    const highByte = (baseLength >> 7) & 0xFF
    textLengthField = lowByte.toString(16).padStart(2, '0') + highByte.toString(16).padStart(2, '0')
    textLengthFieldSize = 2
  }

  // 计算总消息长度
  const messageTotalLength = FIXED_HEADER + textLengthFieldSize + SEPARATOR +
        textLengthFieldSize1 + byteLength + FIXED_SUFFIX_LENGTH

  const messageLengthHex = messageTotalLength.toString(16).padStart(10, '0')

  // 构造完整的十六进制字符串
  const hexString = (
    messageLengthHex +
        '12' +
        textLengthField +
        '0A' +
        textLengthField1 +
        bytes.toString('hex') +
        '10016A2432343163636435662D393162612D343131382D393239612D3936626330313631626432612' +
        '2002A132F643A2F6964656150726F2F656475626F73733A1E0A' +
        // 将模型名称长度转换为两位十六进制，并确保是大写
        Buffer.from(modelName, 'utf-8').length.toString(16).padStart(2, '0').toUpperCase() +
        Buffer.from(modelName, 'utf-8').toString('hex').toUpperCase() +
        '22004A' +
        '24' + '61383761396133342D323164642D343863372D623434662D616636633365636536663765' +
        '680070007A2436393337376535612D386332642D343835342D623564392D653062623232336163303061' +
        '800101B00100C00100E00100E80100'
  ).toUpperCase()
  return Buffer.from(hexString, 'hex')
}

// 封装函数，用于将 chunk 转换为 UTF-8 字符串
function chunkToUtf8String (chunk) {
  if (!(chunk[0] === 0x00 && chunk[1] === 0x00)) {
    const chunkString = Buffer.from(chunk).toString('hex')
    console.log('===========chunk:', chunkString, '===========utf-8:', Buffer.from(chunk).toString('utf-8'))
    return ''
  }
  console.log('chunk:', chunk)

  // 跳过开头的所有0x00
  let startIndex = 0
  while (startIndex < chunk.length && chunk[startIndex] === 0x00) {
    startIndex++
  }

  // 使用去掉开头0x00后的chunk
  const trimmedChunk = chunk.slice(startIndex)
  console.log('trimmedChunk:', trimmedChunk)

  // 如果chunk全是0x00，返回空字符串
  if (trimmedChunk.length === 0) {
    return ''
  }

  // // 只处理以 0x00 0x00 0x00 0x00 开头的 chunk，其他不处理，不然会有乱码

  const chunkString = Buffer.from(trimmedChunk).toString('hex')
  console.log('hex:', chunkString)
  console.log('==utf8:', Buffer.from(trimmedChunk).toString('utf-8'))

  let result = ''
  let i = 0
  while (i < trimmedChunk.length) {
    const byte = trimmedChunk[i]
    if (i <= 2) {
      i += 1
      continue
    }

    // 英文
    if (byte >= 0x20 && byte <= 0x7E) {
      const char = Buffer.from([byte]).toString('utf-8')
      console.log(`Byte ${i}: hex=${byte.toString(16)}, char=${char} (ASCII)`)
      result += char
      i += 1
      continue
    }

    // UTF-8中文字符 (3字节)
    if (i + 2 < trimmedChunk.length && byte >= 0xE0) {
      const bytes = trimmedChunk.slice(i, i + 3)
      const char = Buffer.from(bytes).toString('utf-8')
      console.log(`Bytes ${i}-${i+2}: hex=${Buffer.from(bytes).toString('hex')}, char=${char} (Chinese)`)
      result += char
      i += 3
      continue
    }
    // 换行符 (0x0A)
    if (byte === 0x0A) {
      console.log(`Bytes ${i}: hex=${byte.toString(16)}, char=\n (Line Feed)`)
      result += '\n'
      i += 1
      continue
    }
    // // 空格字符 (0x20)
    // if (byte === 0x20) {
    //   result += ''
    //   i += 1
    //   continue
    // }

    // 其他字符跳过
    i += 1
  }

  if (result.startsWith('P')) {
    result = result.substring(1)
  }
  return result

  // 只移除开头的控制字符，保留中间的换行符
  // let utf8String = Buffer.from(trimmedChunk).toString('utf-8')
  //   .replace(/^[#\n!]+/, '')  // 移除开头的#、换行符和感叹号
  //   .replace(/^[&\n$]+/, '')  // 移除开头的&、换行符和$
  //   .replace(/^\s+/, '')  // 移除开头的所有空白字符（包括空格、换行等）
  // if (chunkString.startsWith('00000000')) {
  //   utf8String = utf8String.substring(1)
  // }
  
  // console.log('>>utf8:', utf8String)

  // return utf8String
  // console.log('chunk:', chunkString)
  // console.log('chunk string:', Buffer.from(chunk).toString('utf-8'))

  // // 去掉 chunk 中 0x0A 以及之前的字符
  // chunk = chunk.slice(chunk.indexOf(0x0A) + 1)

  // let filteredChunk = []
  // let i = 0
  // const hasZero = chunkString.startsWith('00000000')
  // while (i < chunk.length) {
  //   // 新的条件过滤：如果遇到连续4个0x00，则移除其之后所有的以 0 开头的字节（0x00 到 0x0F）
  //   if (chunk.slice(i, i + 4).every(byte => byte === 0x00)) {
  //     i += 4 // 跳过这4个0x00
  //     while (i < chunk.length && chunk[i] >= 0x00 && chunk[i] <= 0x0F) {
  //       i++ // 跳过所有以 0 开头的字节
  //     }
  //     continue
  //   }

  //   if (chunk[i] === 0x0C) {
  //     // 遇到 0x0C 时，跳过 0x0C 以及后续的所有连续的 0x0A
  //     i++ // 跳过 0x0C
  //     while (i < chunk.length && chunk[i] === 0x0A) {
  //       i++ // 跳过所有连续的 0x0A
  //     }
  //   } else if (
  //     i > 0 &&
  //     chunk[i] === 0x0A &&
  //     chunk[i - 1] >= 0x00 &&
  //     chunk[i - 1] <= 0x09
  //   ) {
  //     // 如果当前字节是 0x0A，且前一个字节在 0x00 至 0x09 之间，跳过前一个字节和当前字节
  //     filteredChunk.pop() // 移除已添加的前一个字节
  //     i++ // 跳过当前的 0x0A
  //   } else {
  //     filteredChunk.push(chunk[i])
  //     i++
  //   }
  // }

  // // 第二步：去除所有的 0x00 和 0x0C
  // filteredChunk = filteredChunk.filter((byte) => byte !== 0x00 && byte !== 0x0C)

  // // 去除小于 0x0A 的字节
  // filteredChunk = filteredChunk.filter((byte) => byte >= 0x0A)

  // // const hexString = Buffer.from(filteredChunk).toString('hex')
  // let utf8String = Buffer.from(filteredChunk).toString('utf-8')
  // // if (hasZero) {
  // //   utf8String = utf8String.substring(1)
  // // }

  // return utf8String
}

module.exports = {
  stringToHex,
  chunkToUtf8String
}
