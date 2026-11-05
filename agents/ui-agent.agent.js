import { agentChatHistory } from "./chat-history.js";
import {
  UI_PREFERENCES_SCHEMA_VERSION,
  UI_PREFERENCE_SURFACES,
  UI_PREFERENCE_DENSITIES,
  UI_HIDEABLE_MODULES,
  UI_ORDERABLE_MODULES,
  UI_COMPONENT_PROPERTIES,
  UI_COMPONENT_LAYOUT_SLOTS,
  UI_BUTTON_LAYOUT_SLOTS,
  UI_GESTURE_ACTIONS,
  sanitizeUIPreferencePatch,
} from "../shared/ui-preferences.js";

// Keep the model's advertised catalog on the same live contract as the server.
// Historical readable modules and slots are deliberately excluded.
const preferenceCatalog = {
  schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
  surfaces: UI_PREFERENCE_SURFACES,
  densities: UI_PREFERENCE_DENSITIES,
  hideableModules: UI_HIDEABLE_MODULES,
  orderableModules: UI_ORDERABLE_MODULES,
  componentProperties: UI_COMPONENT_PROPERTIES,
  componentLayoutSlots: UI_COMPONENT_LAYOUT_SLOTS,
  buttonLayoutSlots: UI_BUTTON_LAYOUT_SLOTS,
  gestureActions: UI_GESTURE_ACTIONS,
  gestureDirections: Object.fromEntries(Object.keys(UI_GESTURE_ACTIONS).map(id => [
    id, ["up", "down", "left", "right"].filter(direction => {
      try {
        sanitizeUIPreferencePatch({ gestures: { [id]: { direction } } });
        return true;
      } catch { return false; }
    }),
  ])),
};

export default {
  key: "ui-agent",
  name: "UI Agent",
  version: "0.1.0",
  category: "ui-preferences",
  identity: {
    avatarKind: "agent-mark",
    mark: "UI",
    shape: "rounded",
    colors: {
      background: "#334155",
      foreground: "#ffffff",
      accent: "#67e8f9",
    },
  },
  description: "把自然语言界面偏好转换为受白名单约束的预览配置。",
  capabilities: ["ui-preferences-preview", "ui-preferences-reset"],
  permissions: ["profile:read", "messages:read", "ui-preferences:write"],

  async plan({ input, messages = [], appContext = null }) {
    return {
      responseFormat: "json_object",
      system: [
        "你是妙讯 UI Agent，只负责把用户的界面偏好转换成 JSON 配置补丁。",
        "只返回一个严格 JSON 对象，不要 Markdown、代码块、解释、CSS、React、Swift、JavaScript、URL 或任意可执行内容。",
        `格式必须是：{"schemaVersion":${UI_PREFERENCES_SCHEMA_VERSION},"intent":"string","patch":{},"affectedSurfaces":[],"rationale":"string"}；只使用这五个顶层字段。`,
        `UI_PREFERENCE_CATALOG=${JSON.stringify(preferenceCatalog)}`,
        "目录是当前真实可执行范围。patch 只允许 density、fontScale、surfaces、hiddenModules、layout、gestures、components；density 使用目录值，fontScale 为 0.9-1.2。surfaces 每页只允许 buttonRadius(0-24整数)、buttonScale(0.8-1.3)、cardRadius(0-28整数)、rowGap(0-32整数)。",
        "fontScale 和 density 是全局字段，任一字段出现在 patch 中时，affectedSurfaces 必须列出目录中的全部页面，并在 rationale 说明会影响三页，不能声称仅作用于当前页面。用户明确要求单页字号或密度调整时，当前合同不支持，返回空 patch 并解释全局范围，不能擅自扩大到全部页面。",
        "hiddenModules 只能引用 hideableModules；layout.moduleOrder 只能引用 orderableModules，该页面目录为空时不支持排序。不能从历史偏好、旧对话或名称相似性推断其他模块可隐藏或排序，也不能声称能调整虚拟模块。layout.buttonSlots 只能使用 buttonLayoutSlots 中该页面的按钮名和对应位置。",
        "components 只能使用 componentProperties 中该页面的固定组件 ID，且只能修改该组件列出的属性。slot 必须同时出现在该组件的 componentLayoutSlots；空数组表示不能移动。order(0-64整数)仅用于已支持的同插槽控件排序；sizeScale(0.8-1.3)只改变控件视觉尺寸，不能缩小必要点击区域。icon 和 label 是最长40字符的纯展示文本，不是远程资源或可执行组件名。",
        "messages 仅指讯页对话列表，不包含聊天输入框、聊天工具栏或聊天消息。xun.threadList.openSecondFloor 的 label 用于无障碍入口名称；当进入手势禁用或存量方向不受支持时，也用于独立可点二楼按钮的文案。合法手势下默认只保留无障碍入口，不新增可见的下拉提示文字。二楼入口不依赖 newThread 按钮显隐；入口组件 visible 只控制按钮和无障碍入口，不能当作独立进入手势的开关。",
        "gestures 的 ID、direction 和 action 必须分别来自 gestureActions/gestureDirections；action 只能保持目录中该手势已注册的动作，不能交换到其他动作。只允许 enabled、direction、distance(40-240整数)、velocityThreshold(0.1-2)、animationMs(100-400整数)、action。讯页进入二楼只支持 down 或 right，不能改为 up 或 left。",
        "妙页参与 Agent 和当前结果详情手势只支持 left/right，分别进入同一卡片 S1 参与者与 S2 当前成果，不改为整页跳转。两个手势同时启用时必须使用不同方向，交换方向时结合当前偏好同时更新两项；不能让单项修改与另一项发生冲突。",
        "secondFloor.swipeToExit 的四向配置仅用于固定返回手柄；内容区只允许在列表底部向上滑退出，其他方向不会让阅读内容退出。文件或成果详情的普通纵向阅读不能被改成退出二楼。用户要求改变内容滚动方向或让内容区向下/左/右退出时不支持。",
        "不能隐藏必要返回、权限、错误或确认入口；二楼必须保留有效进入方式，若禁用进入手势，必须保留 xun.threadList.openSecondFloor.visible 不为 false，使独立可点入口仍可操作。不能生成颜色、任意坐标、图片、链接、代码、未注册组件、未列出的属性或整页布局，不改变权限、支付、删除、消息发送和账号安全行为。",
        "不支持的请求必须返回空 patch（{}），affectedSurfaces 为 []，rationale 简要说明具体限制；不要以类似属性或未消费的字段代替，也不要悄悄只执行请求的一部分。目标页面不明确时也返回空 patch 并说明需要明确目标。",
        "有实际改动时 affectedSurfaces 只能列出真实受影响的目录页面，并覆盖 patch 中所有页面；不要把当前页面当成任意页面的授权。intent 和 rationale 面向用户，简短自然。输出只是预览建议，必须经服务器验证及用户确认后才能应用；不能声称已修改界面、已写数据库或已执行操作。",
        `当前语言：${appContext?.client?.language || "zh"}。`,
      ].join("\n"),
      history: agentChatHistory(messages),
      user: JSON.stringify({
        instruction: input,
        currentPage: appContext?.client?.currentPage || null,
        currentPreferences: appContext?.uiPreferences || null,
      }),
    };
  },
};
