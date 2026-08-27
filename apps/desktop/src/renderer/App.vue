<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

interface VisibleSearchResult {
  readonly resultId: string;
  readonly title: string;
  readonly description: string;
  readonly actionId: string;
  readonly actionToken: string;
}

interface ActiveSearchHandle {
  readonly sessionId: string;
  cancel(): void;
}

const status = ref("正在连接宿主…");
const version = ref("—");
const error = ref<string | undefined>();
const visibilityCapabilitySummary = ref("未调用");
const focusCapabilitySummary = ref("未调用");
const query = ref("");
const inputContext = ref("");
const results = ref<readonly VisibleSearchResult[]>([]);
const selectedResultId = ref<string | undefined>();
const searchHandle = ref<ActiveSearchHandle | undefined>();
const inputElement = ref<HTMLInputElement>();
const searchPending = ref(false);
let searchGeneration = 0;
let searchTimer: number | undefined;
let removeVisibilityListener: (() => void) | undefined;

const searchFeedback = computed((): string => {
  if (searchPending.value) {
    return "正在搜索宿主命令";
  }
  if (query.value.length > 0 && results.value.length === 0) {
    return "没有匹配的宿主命令";
  }
  if (results.value.length > 0) {
    return `找到 ${String(results.value.length)} 个搜索结果`;
  }
  return "输入关键词开始搜索";
});

/**
 * Releases the current Renderer-side Search Handle after the Host window is hidden.
 *
 * @returns Nothing after the local event listener and Main-owned session are released.
 */
function cancelActiveSearch(): void {
  searchHandle.value?.cancel();
  searchHandle.value = undefined;
  searchPending.value = false;
}

/**
 * Keeps selection attached to a result identity after an incremental update.
 *
 * @param nextResults The newly visible result list.
 * @returns Nothing after the selected result ID has been updated.
 */
function keepSelection(nextResults: readonly VisibleSearchResult[]): void {
  if (
    selectedResultId.value !== undefined &&
    nextResults.some(({ resultId }) => resultId === selectedResultId.value)
  ) {
    return;
  }
  selectedResultId.value = nextResults[0]?.resultId;
}

/**
 * Starts the current query through the connection-bound Host Search Bridge.
 *
 * @returns Nothing after the asynchronous search lifecycle has been started.
 */
async function runSearch(): Promise<void> {
  const generation = ++searchGeneration;
  cancelActiveSearch();
  results.value = [];
  selectedResultId.value = undefined;
  searchPending.value = true;
  const currentQuery = query.value;
  try {
    const handle = await window.ztoolsHost.startSearch(
      currentQuery,
      (event) => {
        if (generation !== searchGeneration) {
          return;
        }
        if (event.type === "result-batch") {
          results.value = event.results;
          keepSelection(event.results);
          searchPending.value = false;
        } else if (event.type === "provider-failed") {
          error.value = "search.providerUnavailable";
        } else if (event.type === "completed" || event.type === "cancelled") {
          searchPending.value = false;
        }
      },
    );
    if (generation === searchGeneration) {
      searchHandle.value = handle;
    } else {
      handle.cancel();
    }
  } catch {
    if (generation === searchGeneration) {
      error.value = "search.unavailable";
      searchPending.value = false;
    }
  }
}

/**
 * Schedules a replacement search without retaining query text outside the active process.
 *
 * @returns Nothing after the short input debounce has been scheduled.
 */
function scheduleSearch(): void {
  if (searchTimer !== undefined) {
    window.clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout((): void => {
    void runSearch();
  }, 16);
}

/**
 * Moves keyboard selection in a circular result list.
 *
 * @param direction The signed movement direction.
 * @returns Nothing after the selected result identity changes.
 */
function moveSelection(direction: 1 | -1): void {
  if (results.value.length === 0) {
    return;
  }
  const currentIndex = results.value.findIndex(
    ({ resultId }) => resultId === selectedResultId.value,
  );
  const nextIndex =
    (currentIndex + direction + results.value.length) % results.value.length;
  selectedResultId.value = results.value[nextIndex]?.resultId;
}

/**
 * Executes the selected result through its opaque, connection-owned action token.
 *
 * @returns Nothing after displaying the stable action and focus outcome.
 */
async function executeSelection(): Promise<void> {
  const handle = searchHandle.value;
  const selected = results.value.find(
    ({ resultId }) => resultId === selectedResultId.value,
  );
  if (handle === undefined || selected === undefined) {
    return;
  }
  try {
    const response = await window.ztoolsHost.executeAction(
      handle.sessionId,
      selected.actionToken,
    );
    if (!response.ok) {
      error.value = response.messageKey ?? "action.unavailable";
      return;
    }
    if (response.effectOutcome === "committed") {
      // Hide ends the visible search session even when focus restoration is degraded.
      cancelActiveSearch();
    }
    status.value =
      response.effectOutcome === "committed"
        ? "窗口已隐藏"
        : "无法确认窗口是否已隐藏";
    if (response.value?.focusResult === "unavailable") {
      error.value = "focus.restoreUnavailable";
    }
    if (response.value !== undefined) {
      const visibilityCapability = response.value.visibilityCapability;
      const focusCapability = response.value.focusCapability;
      visibilityCapabilitySummary.value = [
        visibilityCapability.implementation.state,
        visibilityCapability.dependency.state,
        visibilityCapability.systemAuthorization.state,
        visibilityCapability.health.state,
        visibilityCapability.permission.state,
      ].join(" · ");
      focusCapabilitySummary.value = [
        focusCapability.implementation.state,
        focusCapability.dependency.state,
        focusCapability.systemAuthorization.state,
        focusCapability.health.state,
        focusCapability.permission.state,
      ].join(" · ");
    }
  } catch {
    error.value = "action.connectionFailed";
  }
}

/**
 * Handles the Host UI keyboard state machine, including the accepted Esc sequence.
 *
 * @param event The trusted Host UI keyboard event.
 * @returns Nothing after applying the keyboard transition.
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    void executeSelection();
  } else if (event.key === "Escape") {
    event.preventDefault();
    if (query.value.length > 0) {
      query.value = "";
    } else if (inputContext.value.length > 0) {
      inputContext.value = "";
    } else {
      void window.ztoolsHost
        .setWindowVisibility("hide", "escape")
        .then((response) => {
          if (response.ok && response.value?.visibility === "hidden") {
            cancelActiveSearch();
            status.value = "窗口已隐藏";
          } else {
            error.value = response.messageKey ?? "window.hideUnavailable";
          }
        })
        .catch(() => {
          error.value = "window.hideConnectionFailed";
        });
    }
  }
}

watch(query, () => {
  error.value = undefined;
  scheduleSearch();
});

onMounted(async () => {
  inputElement.value?.focus();
  removeVisibilityListener = window.ztoolsHost.onWindowVisibilityChange(
    ({ visibility }) => {
      if (visibility === "visible") {
        status.value = "窗口已显示";
        inputElement.value?.focus();
      }
    },
  );
  try {
    const result = await window.ztoolsHost.getBootstrap();
    if (result.ok && result.value !== undefined) {
      status.value = "宿主已就绪";
      version.value = result.value.applicationVersion;
      await nextTick();
      void runSearch();
    } else {
      status.value = "宿主拒绝了请求";
      error.value = result.messageKey ?? result.code ?? "gateway.unknownError";
    }
  } catch {
    status.value = "宿主连接失败";
    error.value = "gateway.connectionFailed";
  }
});

onUnmounted(() => {
  removeVisibilityListener?.();
  cancelActiveSearch();
  if (searchTimer !== undefined) {
    window.clearTimeout(searchTimer);
  }
});
</script>

<template>
  <main class="shell" @keydown="handleKeydown">
    <section class="hero" aria-labelledby="page-title">
      <p class="eyebrow">ZTOOLS VNEXT · HOST SEARCH</p>
      <h1 id="page-title">把常用操作，放回手边。</h1>
      <p class="subtitle">
        在可信宿主内搜索固定命令。搜索内容只保留在当前进程中。
      </p>
    </section>

    <section class="search-card" aria-label="宿主命令搜索">
      <label class="search-label" for="search-input">搜索命令</label>
      <input
        id="search-input"
        ref="inputElement"
        v-model="query"
        class="search-input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="输入命令名称或关键词"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="search-results"
        aria-describedby="search-instructions search-feedback"
        :aria-expanded="results.length > 0"
        :aria-activedescendant="
          selectedResultId ? `result-${selectedResultId}` : undefined
        "
      />
      <p id="search-instructions" class="search-hint">
        输入关键词开始搜索 · ↑↓ 选择 · Enter 执行 · Esc 退出
      </p>
      <p
        id="search-feedback"
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ searchFeedback }}
      </p>
      <ul
        id="search-results"
        class="results"
        role="listbox"
        aria-label="搜索结果"
        :aria-busy="searchPending"
      >
        <li
          v-for="result in results"
          :id="`result-${result.resultId}`"
          :key="result.resultId"
          class="result"
          :class="{ selected: result.resultId === selectedResultId }"
          role="option"
          :aria-selected="result.resultId === selectedResultId"
          @click="
            selectedResultId = result.resultId;
            executeSelection();
          "
        >
          <span class="result-title">{{ result.title }}</span>
          <span class="result-description">{{ result.description }}</span>
        </li>
      </ul>
      <p
        v-if="query.length > 0 && !searchPending && results.length === 0"
        class="empty"
      >
        没有匹配的宿主命令
      </p>
    </section>

    <section class="status-card" aria-label="宿主状态">
      <span
        class="status-dot"
        :class="{ ready: !error }"
        aria-hidden="true"
      ></span>
      <div>
        <p
          class="status-label"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {{ status }}
        </p>
        <p
          v-if="error"
          class="status-detail"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {{ error }}
        </p>
        <p v-else class="status-detail">
          应用版本 {{ version }} · Contract Gateway v1
        </p>
        <p class="status-detail">窗口显示：{{ visibilityCapabilitySummary }}</p>
        <p class="status-detail">焦点恢复：{{ focusCapabilitySummary }}</p>
      </div>
    </section>
  </main>
</template>

<style>
:root {
  color: #152018;
  background: #eef3eb;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
* {
  box-sizing: border-box;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
body {
  margin: 0;
}
.shell {
  min-height: 100vh;
  padding: 56px clamp(24px, 8vw, 96px);
  background:
    radial-gradient(circle at 82% 12%, #d8e8cf 0, transparent 34%),
    linear-gradient(145deg, #f8fbf6 0%, #e4eee0 100%);
}
.hero {
  max-width: 680px;
}
.eyebrow {
  color: #4a6a51;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
h1 {
  max-width: 600px;
  margin: 16px 0;
  font-size: clamp(36px, 6vw, 64px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}
.subtitle {
  max-width: 560px;
  color: #4c5d50;
  font-size: 16px;
  line-height: 1.6;
}
.search-card {
  max-width: 680px;
  margin-top: 36px;
  padding: 20px;
  border: 1px solid #cbdcc8;
  border-radius: 18px;
  background: rgb(255 255 255 / 72%);
  box-shadow: 0 16px 36px rgb(54 85 57 / 8%);
}
.search-label {
  display: block;
  margin-bottom: 8px;
  color: #4a6a51;
  font-size: 12px;
  font-weight: 700;
}
.search-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #b8cdb5;
  border-radius: 12px;
  outline: 0;
  background: #fff;
  color: #152018;
  font: inherit;
  font-size: 18px;
}
.search-input:focus {
  border-color: #4e9661;
  box-shadow: 0 0 0 4px rgb(78 150 97 / 16%);
}
.search-input:focus-visible {
  outline: 3px solid #2f7443;
  outline-offset: 2px;
}
.search-hint,
.empty {
  margin: 12px 2px 0;
  color: #67766a;
  font-size: 13px;
}
.results {
  display: grid;
  gap: 6px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.result {
  display: grid;
  width: 100%;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.result:hover,
.result.selected {
  border-color: #b8cdb5;
  background: #edf6ea;
}
.result-title {
  font-weight: 700;
}
.result-description {
  color: #67766a;
  font-size: 13px;
}
.status-card {
  display: flex;
  gap: 14px;
  align-items: center;
  max-width: 680px;
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid #d4e1d0;
  border-radius: 14px;
  background: rgb(255 255 255 / 55%);
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #c8904d;
}
.status-dot.ready {
  background: #4e9661;
}
.status-label,
.status-detail {
  margin: 0;
}
.status-label {
  font-weight: 700;
}
.status-detail {
  margin-top: 4px;
  color: #67766a;
  font-size: 13px;
}
@media (forced-colors: active) {
  :root,
  .shell {
    color: CanvasText;
    background: Canvas;
  }
  .eyebrow,
  .subtitle,
  .search-label,
  .search-hint,
  .empty,
  .result-description,
  .status-detail {
    color: CanvasText;
  }
  .search-card,
  .search-input,
  .result,
  .status-card {
    border-color: CanvasText;
    background: Canvas;
    color: CanvasText;
    box-shadow: none;
  }
  .search-input:focus-visible {
    border-color: Highlight;
    outline: 3px solid Highlight;
    box-shadow: none;
  }
  .result:hover,
  .result.selected {
    border-color: Highlight;
    background: Highlight;
    color: HighlightText;
    forced-color-adjust: none;
  }
  .result:hover .result-description,
  .result.selected .result-description {
    color: inherit;
  }
  .status-dot {
    border: 1px solid CanvasText;
  }
  .status-dot.ready {
    background: Highlight;
  }
}
</style>
