// b64run.js：按处理预算处理事件并留账，收尾不限预算清账
import { groupOf, leftOf } from "./b64.js";

const DEFAULT_BAD_BYTE = "E_BAD_BYTE";
const DEFAULT_SHORT = "E_SHORT";
const DEFAULT_BAD_EVENT = "E_BAD_EVENT";

function errorWith(spec, key, fallback, message) {
  const err = new Error(message);
  err.code = spec && spec[key] ? spec[key] : fallback;
  return err;
}

// 跨轮状态：groups 已编码组、buffer 残留、ledger 待处理账、applied 已处理 id。
function cloneState(state) {
  const src = state || {};
  return {
    groups: Array.isArray(src.groups) ? src.groups.slice() : [],
    buffer: typeof src.buffer === "string" ? src.buffer : "",
    ledger: Array.isArray(src.ledger) ? src.ledger.map(normalizeEntry) : [],
    applied: Array.isArray(src.applied) ? src.applied.slice() : []
  };
}

// 账上条目统一成 {id, kind, text}；兼容 [kind, text, id?] / [kind, text] 两种旧形状。
function normalizeEntry(entry) {
  if (Array.isArray(entry)) {
    return { kind: entry[0], text: entry[1] === undefined ? "" : entry[1], id: entry[2] };
  }
  return {
    id: entry && entry.id,
    kind: entry && entry.kind,
    text: entry && typeof entry.text === "string" ? entry.text : ""
  };
}

function asEntry(event) {
  return { id: event.id, kind: event.kind, text: typeof event.text === "string" ? event.text : "" };
}

// 账上对外只给 [kind, text] 两元组。
function ledgerView(ledger) {
  return ledger.map((entry) => [entry.kind, entry.text]);
}

// 先校验事件结构，再校验数据块字节。
function validate(events, spec) {
  for (const event of events) {
    if (!event || typeof event !== "object"
      || (event.kind !== "feed" && event.kind !== "emit")) {
      throw errorWith(spec, "event_error_code", DEFAULT_BAD_EVENT, "非法事件");
    }
    if (event.kind === "feed" && typeof event.text !== "string") {
      throw errorWith(spec, "event_error_code", DEFAULT_BAD_EVENT, "数据块缺文本");
    }
  }
  for (const event of events) {
    if (event.kind !== "feed") continue;
    for (let i = 0; i < event.text.length; i += 1) {
      const code = event.text.charCodeAt(i);
      if (code < 32 || code > 126) {
        throw errorWith(spec, "byte_code", DEFAULT_BAD_BYTE, "不可打印字符");
      }
    }
  }
}

// 真正消费一条事件：feed 追加缓冲；emit 仅在够一组时编一组，否则 E_SHORT。
function applyEntry(work, entry, spec) {
  if (entry.kind === "feed") {
    work.buffer += entry.text;
    return;
  }
  const group = groupOf(work.buffer);
  if (group === "") {
    throw errorWith(spec, "short_code", DEFAULT_SHORT, "缓冲不足一组");
  }
  work.groups.push(group);
  work.buffer = leftOf(work.buffer);
}

// 按共用处理预算跑一批：先清旧账，再跑新事件，预算用尽后连着压账。
export function step(spec) {
  const input = spec || {};
  const events = Array.isArray(input.events) ? input.events : [];
  validate(events, input);

  const work = cloneState(input.state);
  let served = 0;
  let budget = Number.isFinite(input.budget) ? Math.max(0, Math.floor(Number(input.budget))) : 0;

  // 先把上一轮留下的账按预算往外清。
  let head = 0;
  while (head < work.ledger.length && budget > 0) {
    applyEntry(work, work.ledger[head], input);
    if (work.applied.indexOf(work.ledger[head].id) === -1
      && work.ledger[head].id !== undefined) {
      work.applied.push(work.ledger[head].id);
    }
    head += 1;
    served += 1;
    budget -= 1;
  }
  work.ledger = work.ledger.slice(head);

  // 重放时已处理的事件直接跳过，不花预算、不再压账。
  let judged = 0;
  for (const event of events) {
    if (event.id !== undefined && work.applied.indexOf(event.id) !== -1) continue;
    judged += 1;
    const entry = asEntry(event);
    if (budget > 0) {
      applyEntry(work, entry, input);
      if (event.id !== undefined) work.applied.push(event.id);
      served += 1;
      budget -= 1;
    } else {
      work.ledger.push(entry);
    }
  }

  return {
    state: work,
    served,
    ledger_before: work.ledger.length,
    ledger: ledgerView(work.ledger),
    judged,
    judged_bound: events.length
  };
}

// 收尾：不限预算把账上条目逐条处理完，返回补齐条数；不接收新事件。
export function close(spec) {
  const input = spec || {};
  const work = cloneState(input.state);
  let catchup = 0;
  while (work.ledger.length > 0) {
    const entry = work.ledger.shift();
    applyEntry(work, entry, input);
    if (work.applied.indexOf(entry.id) === -1 && entry.id !== undefined) {
      work.applied.push(entry.id);
    }
    catchup += 1;
  }
  return { state: work, catchup };
}
