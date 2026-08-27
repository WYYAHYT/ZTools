import { Type, type Static } from "@sinclair/typebox";

export const HOST_BOOTSTRAP_METHOD = "host.bootstrap.get" as const;
export const HOST_PROTOCOL_VERSION = 1 as const;

export const HostBootstrapInputSchema = Type.Object(
  {},
  { additionalProperties: false },
);

export const HostBootstrapOutputSchema = Type.Object(
  {
    applicationVersion: Type.String({ minLength: 1, maxLength: 64 }),
    protocolVersion: Type.Literal(HOST_PROTOCOL_VERSION),
    status: Type.Literal("ready"),
  },
  { additionalProperties: false },
);

export type HostBootstrapInput = Static<typeof HostBootstrapInputSchema>;
export type HostBootstrapOutput = Static<typeof HostBootstrapOutputSchema>;

export const HOST_SEARCH_START_METHOD = "host.search.session.start" as const;
export const HOST_SEARCH_CANCEL_METHOD = "host.search.session.cancel" as const;
export const HOST_SEARCH_ACK_METHOD = "host.search.session.ack" as const;
export const HOST_SEARCH_EVENT_CHANNEL = "ztools.host.search.event" as const;
export const HOST_ACTION_EXECUTE_METHOD = "host.action.execute" as const;
export const HOST_WINDOW_VISIBILITY_SET_METHOD =
  "host.window.visibility.set" as const;

export const WindowVisibilitySetInputSchema = Type.Object(
  {
    visibility: Type.Union([Type.Literal("show"), Type.Literal("hide")]),
    reason: Type.Union([
      Type.Literal("user-action"),
      Type.Literal("escape"),
      Type.Literal("launcher-recall"),
    ]),
  },
  { additionalProperties: false },
);

export const SearchStartInputSchema = Type.Object(
  {
    sessionId: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
    query: Type.String({ maxLength: 1_024 }),
  },
  { additionalProperties: false },
);

export const SearchSessionReferenceSchema = Type.Object(
  {
    sessionId: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
  },
  { additionalProperties: false },
);

export const SearchAckInputSchema = Type.Object(
  {
    sessionId: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
    sequence: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const SearchStartOutputSchema = Type.Object(
  {
    sessionId: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
    protocolVersion: Type.Literal(1),
  },
  { additionalProperties: false },
);

export const SearchCommandResultSchema = Type.Object(
  {
    providerId: Type.String({ minLength: 1, maxLength: 64 }),
    providerPriority: Type.Integer(),
    resultId: Type.String({ minLength: 1, maxLength: 128 }),
    commandId: Type.String({ minLength: 1, maxLength: 128 }),
    title: Type.String({ minLength: 1, maxLength: 256 }),
    description: Type.String({ maxLength: 512 }),
    keywords: Type.Array(Type.String({ maxLength: 128 }), { maxItems: 32 }),
    actionId: Type.String({ minLength: 1, maxLength: 128 }),
    actionToken: Type.String({
      minLength: 16,
      maxLength: 128,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
    normalizedTitle: Type.String({ minLength: 1, maxLength: 256 }),
    dedupeKey: Type.String({ minLength: 1, maxLength: 128 }),
    matchKind: Type.Union([
      Type.Literal("exact"),
      Type.Literal("prefix"),
      Type.Literal("token-prefix"),
      Type.Literal("substring"),
      Type.Literal("subsequence"),
      Type.Literal("empty-query"),
    ]),
  },
  { additionalProperties: false },
);

export const ActionExecuteInputSchema = Type.Object(
  {
    sessionId: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
    actionToken: Type.String({
      minLength: 16,
      maxLength: 128,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
  },
  { additionalProperties: false },
);

const capabilityReasonFields = {
  reasonCode: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  recoverability: Type.Optional(
    Type.Union([
      Type.Literal("automatic"),
      Type.Literal("user-action"),
      Type.Literal("not-recoverable"),
    ]),
  ),
};

const windowCapabilityAxes = {
  capabilityVersion: Type.Literal(1),
  implementation: Type.Object(
    {
      state: Type.Union([
        Type.Literal("supported"),
        Type.Literal("unsupported"),
      ]),
      ...capabilityReasonFields,
    },
    { additionalProperties: false },
  ),
  dependency: Type.Object(
    {
      state: Type.Union([
        Type.Literal("not-required"),
        Type.Literal("ready"),
        Type.Literal("missing"),
        Type.Literal("disabled"),
        Type.Literal("incompatible"),
      ]),
      ...capabilityReasonFields,
    },
    { additionalProperties: false },
  ),
  systemAuthorization: Type.Object(
    {
      state: Type.Union([
        Type.Literal("not-required"),
        Type.Literal("not-determined"),
        Type.Literal("granted"),
        Type.Literal("denied"),
        Type.Literal("restricted"),
      ]),
      ...capabilityReasonFields,
    },
    { additionalProperties: false },
  ),
  health: Type.Object(
    {
      state: Type.Union([
        Type.Literal("ready"),
        Type.Literal("degraded"),
        Type.Literal("unavailable"),
      ]),
      ...capabilityReasonFields,
    },
    { additionalProperties: false },
  ),
  permission: Type.Object(
    {
      state: Type.Union([
        Type.Literal("not-applicable"),
        Type.Literal("not-requested"),
        Type.Literal("granted"),
        Type.Literal("denied"),
        Type.Literal("revoked"),
      ]),
      ...capabilityReasonFields,
    },
    { additionalProperties: false },
  ),
};

export const LauncherVisibilityCapabilitySnapshotSchema = Type.Object(
  {
    capabilityId: Type.Literal("host.launcher-visibility"),
    ...windowCapabilityAxes,
  },
  { additionalProperties: false },
);

export const PreviousAppFocusCapabilitySnapshotSchema = Type.Object(
  {
    capabilityId: Type.Literal("host.previous-app-focus"),
    ...windowCapabilityAxes,
  },
  { additionalProperties: false },
);

export const WindowCapabilitySnapshotSchema = Type.Union([
  LauncherVisibilityCapabilitySnapshotSchema,
  PreviousAppFocusCapabilitySnapshotSchema,
]);

export const WindowVisibilitySetOutputSchema = Type.Object(
  {
    visibility: Type.Union([Type.Literal("visible"), Type.Literal("hidden")]),
    effectOutcome: Type.Union([
      Type.Literal("committed"),
      Type.Literal("not-committed"),
      Type.Literal("unknown"),
    ]),
    capability: LauncherVisibilityCapabilitySnapshotSchema,
  },
  { additionalProperties: false },
);

export const ActionExecuteOutputSchema = Type.Object(
  {
    effectOutcome: Type.Union([
      Type.Literal("not-started"),
      Type.Literal("committed"),
      Type.Literal("not-committed"),
      Type.Literal("unknown"),
    ]),
    focusResult: Type.Union([
      Type.Literal("not-attempted"),
      Type.Literal("restored"),
      Type.Literal("restricted"),
      Type.Literal("unavailable"),
    ]),
    visibilityCapability: LauncherVisibilityCapabilitySnapshotSchema,
    focusCapability: PreviousAppFocusCapabilitySnapshotSchema,
  },
  { additionalProperties: false },
);

export const SearchEventSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal("started"),
      sessionId: Type.String(),
      sequence: Type.Integer({ minimum: 1 }),
      emittedAtUnixMs: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("result-batch"),
      sessionId: Type.String(),
      sequence: Type.Integer({ minimum: 1 }),
      emittedAtUnixMs: Type.Integer({ minimum: 0 }),
      revision: Type.Integer({ minimum: 1 }),
      results: Type.Array(SearchCommandResultSchema, { maxItems: 50 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("provider-failed"),
      sessionId: Type.String(),
      sequence: Type.Integer({ minimum: 1 }),
      emittedAtUnixMs: Type.Integer({ minimum: 0 }),
      providerId: Type.String(),
      code: Type.Literal("provider.failed"),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Union([Type.Literal("completed"), Type.Literal("cancelled")]),
      sessionId: Type.String(),
      sequence: Type.Integer({ minimum: 1 }),
      emittedAtUnixMs: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
]);

export type SearchStartInput = Static<typeof SearchStartInputSchema>;
export type SearchSessionReference = Static<
  typeof SearchSessionReferenceSchema
>;
export type SearchAckInput = Static<typeof SearchAckInputSchema>;
export type SearchStartOutput = Static<typeof SearchStartOutputSchema>;
export type SearchEvent = Static<typeof SearchEventSchema>;
export type ActionExecuteInput = Static<typeof ActionExecuteInputSchema>;
export type ActionExecuteOutput = Static<typeof ActionExecuteOutputSchema>;
export type WindowVisibilitySetInput = Static<
  typeof WindowVisibilitySetInputSchema
>;
export type WindowVisibilitySetOutput = Static<
  typeof WindowVisibilitySetOutputSchema
>;
