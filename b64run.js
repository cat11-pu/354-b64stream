// b64run.js：按共用处理预算顺序处理事件，不够预算就连着压账，收尾不限预算清账
import { groupOf, leftOf } from "./b64.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalize(event) {
  return { id: event.id, kind: event.kind, text: event.kind === "feed" ? String(event.text) : "" };
}

// 结构与字节先于一切状态变更逐条校验：事件不合法 E_BAD_EVENT，字符不可打印 E_BAD_BYTE。
function validate(events) {
  for (const raw of events) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      fail("E_BAD_EVENT", "事件必须是对象");
    }
    if (raw.kind !== "feed" && raw.kind !== "emit") {
      fail("E_BAD_EVENT", "事件类型不合法: " + String(raw && raw.kind));
    }
    if (raw.kind === "feed" && typeof raw.text !== "string") {
      fail("E_BAD_EVENT", "feed 事件必须带文本");
    }
    if (raw.kind === "feed") {
      for (let index = 0; index < raw.text.length; index += 1) {
        const point = raw.text.codePointAt(index);
        if (point < 32 || point > 126) {
          fail("E_BAD_BYTE", "数据块含不可打印字符");
        }
        if (point > 0xffff) index += 1;
      }
    }
  }
}

function clone(input) {
  const state = input || {};
  return {
    groups: Array.isArray(state.groups) ? state.groups.slice() : [],
    buffer: typeof state.buffer === "string" ? state.buffer : "",
    ledger: Array.isArray(state.ledger) ? state.ledger.map((item) => ({
      id: item && item.id, kind: item.kind,
      text: item.kind === "feed" ? String(item.text) : ""
    })) : [],
    applied: Array.isArray(state.applied) ? state.applied.slice() : []
  };
}

function run(input, events, budget) {
  validate(events);
  const state = clone(input);
  let remaining = budget;
  let served = 0;

  function applyEvent(event) {
    if (event.kind === "feed") {
      state.buffer += event.text;
    } else {
      if (state.buffer.length < 3) fail("E_SHORT", "缓冲不足一组，无法编码");
      state.groups.push(groupOf(state.buffer));
      state.buffer = leftOf(state.buffer);
    }
    state.applied.push(event.id);
    served += 1;
    remaining -= 1;
  }

  // 先清旧账，再处理新事件；预算一用尽，剩余项连着压账（重放已处理项直接跳过，不花预算）。
  const incoming = events.map(normalize);
  const queued = state.ledger.concat(incoming);
  state.ledger = [];
  for (const event of queued) {
    if (state.applied.includes(event.id)) continue;
    if (remaining <= 0) {
      state.ledger.push(event);
      continue;
    }
    applyEvent(event);
  }

  const judged = queued.filter((event) => !state.applied.includes(event.id)).length;
  return {
    state,
    served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map((event) => [event.kind, event.text]),
    judged,
    judged_bound: queued.length
  };
}

export function step(spec) {
  const budget = Number.isFinite(spec.budget) ? Math.max(0, Math.floor(spec.budget)) : 0;
  return run(spec.state, spec.events || [], budget);
}

export function close(spec) {
  const result = run(spec.state, [], Infinity);
  return { state: result.state, catchup: result.served };
}
