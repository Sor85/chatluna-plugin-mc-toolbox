#!/usr/bin/env node
// 沙盒验收：SANDBOX_TOKEN 只从环境变量读取。所有写操作都在本次新建的测试空间内进行。
// 用法：node scripts/sandbox-test.mjs [--keep]
//   --keep  结束后保留空间并输出 ID，用于继续验证版本播报；之后用 complete_test_space 手动结束。
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const token = process.env.SANDBOX_TOKEN
if (!token) throw new Error('SANDBOX_TOKEN 环境变量未设置')
const base = (process.env.SANDBOX_URL ?? 'http://127.0.0.1:61901/api/v1').replace(/\/$/, '')
const keep = process.argv.includes('--keep')
const runId = `mc-toolbox-${randomUUID()}`
const id = randomInt(700000000, 799999990)
const state = { runId, spaceId: undefined, userId: String(id), botId: String(id + 1), groupId: String(id + 2), presetId: `sandbox-test-mc-${id}` }
const passed = []
let presetCreated = false

async function call(name, args = {}) {
  const response = await fetch(`${base}/tools/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId: state.spaceId, testRunId: runId, ...args }),
    signal: AbortSignal.timeout(150000)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(`${name}: ${result.code ?? response.status} ${result.message ?? ''}`)
  return result
}

async function send(content, timeoutSeconds = 60) {
  const conversationId = `group:${state.groupId}`
  const sent = await call('send_message', { operatorId: state.userId, conversationId, content, idempotencyKey: randomUUID() })
  const result = await call('wait_for_message', { cursor: sent.cursorBefore, conversationId, authorId: state.botId, settleSeconds: 3, timeoutSeconds })
  assert.equal(result.outcome, 'matched', `等待机器人回复超时：${content}`)
  const events = result.events ?? [result.event]
  return { events, media: events.flatMap((event) => event.data.media ?? []), raw: JSON.stringify(events) }
}

const png = (media) => media.filter((item) => item.type === 'image' && item.mimeType === 'image/png' && item.size > 5000)

const cases = [
  ['Java 服务器图片', 'mc.server mc.hypixel.net', ({ media }) => assert.equal(png(media).length, 1, '缺少 PNG 卡片')],
  ['Java 服务器文字', 'mc.server -t mc.hypixel.net', ({ raw, media }) => {
    assert.equal(media.length, 0, '文字模式不应发送图片')
    assert.match(raw, /在线人数：\d+ \/ \d+/)
  }],
  ['基岩版服务器图片', 'mc.server -b play.cubecraft.net', ({ media }) => assert.equal(png(media).length, 1, '缺少 PNG 卡片')],
  ['内网地址拦截', 'mc.server 127.0.0.1', ({ raw }) => assert.match(raw, /不允许查询内网或保留地址/)],
  ['地址格式校验', 'mc.server http://evil', ({ raw }) => assert.match(raw, /服务器地址格式无效/)],
  ['玩家图片', 'mc.player jeb_', ({ media }) => assert.equal(png(media).length, 1, '缺少 PNG 卡片')],
  ['玩家文字', 'mc.player -t Notch', ({ raw }) => assert.match(raw, /069a79f4-44e9-4726-a5be-fca90e38aaf5/)],
  ['玩家不存在', 'mc.player zq_no_such_p1x', ({ raw }) => assert.match(raw, /未找到玩家/)],
  ['最新版本图片', 'mc.version', ({ media }) => assert.equal(png(media).length, 1, '缺少 PNG 卡片')],
  ['最新版本文字', 'mc.version -t', ({ raw }) => assert.match(raw, /正式版：/)]
]

try {
  const created = await call('create_test_space', { name: 'MC 工具箱自动验收', idempotencyKey: randomUUID() })
  state.spaceId = created.spaceId
  console.log(`测试空间：${state.spaceId}`)
  await call('apply_environment_changes', {
    expectedRevision: created.revision, idempotencyKey: randomUUID(),
    changes: [
      { action: 'create-user', data: { id: state.userId, name: 'MC 验收用户' } },
      { action: 'create-bot', data: { id: state.botId, name: 'MC 验收机器人', implementation: 'napcat', enabled: true } },
      { action: 'create-group', data: { id: state.groupId, name: 'MC 工具箱验收', members: [{ participantId: state.userId, role: 'owner' }, { participantId: state.botId, role: 'member' }] } }
    ]
  })

  for (const [name, content, check] of cases) {
    const reply = await send(content)
    check(reply)
    passed.push({ name, media: reply.media.map(({ type, mimeType, size }) => ({ type, mimeType, size })) })
    console.log(`通过：${name}${reply.media.length ? `（${reply.media.map((item) => `${item.mimeType} ${item.size} B`).join('，')}）` : ''}`)
  }

  const wakeup = await call('get_wakeup_rules', { conversationId: `group:${state.groupId}`, operatorId: state.userId, botId: state.botId })
  const character = wakeup.scopes?.some((scope) => scope.responders?.some((responder) => responder.engine === 'character'))
  await call('create_test_preset', {
    presetId: state.presetId, loader: character ? 'character-md' : 'md',
    text: `---\n${character ? 'kind: character\n' : ''}name: MC工具箱测试\ndescription: MC 工具箱 AI 工具验收\n${character ? 'nick: [MC验收机器人]\n' : 'tools:\n  allow: [mc_server_status, mc_player_profile, mc_latest_version, reply, run_code, tool_search]\n'}---\n你是插件测试机器人。用户要求查询 Minecraft 服务器时，必须实际调用 mc_server_status 工具，不凭记忆回答；若工具通过 run_code 提供，调用 tools.mc_server_status。拿到结果后用一句中文报告在线人数。\n`
  })
  presetCreated = true
  await call('set_bot_preset', { botId: state.botId, presetId: state.presetId })
  const conversationId = `group:${state.groupId}`
  const reply = await send(`<at id="${state.botId}"/> 用 mc_server_status 工具查询服务器 mc.hypixel.net 的状态，告诉我在线人数。`, 150)
  const calls = await call('list_model_calls', { conversationId, botId: state.botId, limit: 20 })
  let used = calls.calls?.some((item) => item.toolCalls?.includes('mc_server_status'))
  if (!used) for (const item of calls.calls ?? []) {
    if (!item.toolCalls?.includes('run_code')) continue
    const detail = await call('get_model_call', { sessionId: calls.sessionId, seq: item.seq })
    used ||= detail.response?.content?.some((block) => block.type === 'tool-call' && JSON.stringify(block).includes('mc_server_status'))
  }
  assert.ok(used, '模型调用记录中没有 mc_server_status')
  assert.equal(png(reply.media).length, 1, 'AI 工具未发送服务器卡片')
  passed.push({ name: 'AI 工具查询服务器', media: reply.media.map(({ type, mimeType, size }) => ({ type, mimeType, size })) })
  console.log('通过：AI 工具查询服务器')

  if (keep) console.log(`保留空间，继续验证播报：${JSON.stringify(state)}`)
  else await call('complete_test_space', { idempotencyKey: randomUUID() })
  console.log(`验收完成：${passed.length} 项通过`)
  if (process.env.SANDBOX_REPORT) await writeFile(process.env.SANDBOX_REPORT, JSON.stringify({ state, passed }, null, 2))
} catch (error) {
  if (state.spaceId) {
    await call('fail_test_space', { error: error instanceof Error ? error.message : '验收失败', idempotencyKey: randomUUID() })
      .catch(() => console.error(`空间 ${state.spaceId} 未能自动停止，需要在沙盒中手动结束`))
  }
  throw error
} finally {
  if (state.spaceId && presetCreated) {
    await call('set_bot_preset', { botId: state.botId }).catch((error) => console.error('测试路由清理失败', error))
    await call('delete_test_preset', { presetId: state.presetId }).catch((error) => console.error('测试预设清理失败', error))
  }
}
