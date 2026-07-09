import {Language} from '../features/session/useMiaoxunSession';
import {PresenceMode, PublicPresenceStatus} from '../models/api';

export const textFor = (language: Language, zh: string, en: string) =>
  language === 'en' ? en : zh;

const presenceModeLabels: Record<PresenceMode, {zh: string; en: string}> = {
  online: {zh: '在线', en: 'Online'},
  offline: {zh: '离线', en: 'Offline'},
  hidden: {zh: '隐藏', en: 'Hidden'},
};

const publicPresenceLabels: Record<PublicPresenceStatus, {zh: string; en: string}> = {
  online: {zh: '在线', en: 'Online'},
  offline: {zh: '离线', en: 'Offline'},
};

export const presenceModeText = (language: Language, mode?: PresenceMode | null) => {
  const label = presenceModeLabels[mode || 'online'];
  return textFor(language, label.zh, label.en);
};

export const publicPresenceText = (language: Language, status?: PublicPresenceStatus | null) => {
  const label = publicPresenceLabels[status || 'offline'];
  return textFor(language, label.zh, label.en);
};

export const appErrorText = (language: Language, error: unknown, fallbackZh: string, fallbackEn: string) => {
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const value = rawMessage.toLowerCase();
  if (!value) {
    return textFor(language, fallbackZh, fallbackEn);
  }
  if (value.includes('超过 1 分钟') || value.includes('over 1 minute')) {
    return textFor(language, '消息发出超过 1 分钟，不能撤回', 'Messages can only be recalled within 1 minute');
  }
  if (value.includes('before recall tracking')) {
    return textFor(language, '这条历史消息不支持撤回', 'This earlier message cannot be recalled');
  }
  if (value.includes('only the sender can recall')) {
    return textFor(language, '只能撤回自己发送的消息', 'Only the sender can recall this message');
  }
  if (value.includes('authentication required') || value.includes('invalid session') || value.includes('请先登录')) {
    return textFor(language, '请先登录。', 'Please log in first.');
  }
  if (value.includes('thread not found')) {
    return textFor(language, '对话不存在', 'Thread not found');
  }
  if (value.includes('message not found')) {
    return textFor(language, '消息不存在', 'Message not found');
  }
  if (value.includes('profile not found') || value.includes('user not found')) {
    return textFor(language, '用户不存在', 'User not found');
  }
  if (
    value.includes('meshy_api_key') ||
    value.includes('new_api_key') ||
    value.includes('oss_access_key') ||
    value.includes('provider missing') ||
    value.includes('provider not configured') ||
    value.includes('missing provider') ||
    value.includes('missing env') ||
    value.includes('environment variable')
  ) {
    return textFor(
      language,
      '生成服务待配置，暂时无法完成这个操作。',
      'The generation service is pending configuration.',
    );
  }
  if (value.includes('404') || value.includes('not found')) {
    return textFor(language, '当前功能暂时不可用，请稍后重试。', 'This feature is temporarily unavailable.');
  }
  return rawMessage;
};

export const normalizeLocationText = (value?: string | null) =>
  String(value || '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)[0]
    ?.replace(/\s+/g, ' ') || '';

export const displayLocationText = (language: Language, rawValue?: string | null) =>
  displayText(language, normalizeLocationText(rawValue));

export const displayText = (language: Language, rawValue?: string | null) => {
  if (!rawValue) {
    return '';
  }
  if (language === 'zh') {
    return rawValue;
  }
  const mappedValues: Record<string, string> = {
    '妙讯': 'Miaoxun',
    '小站': 'Station',
    '妙讯用户': 'Miaoxun User',
    '妙讯管理员': 'Miaoxun Admin',
    '普通用户': 'User',
    '管理员': 'Admin',
    '未登录': 'Not signed in',
    '未设置': 'Not set',
    '我': 'Me',
    '系统': 'System',
    '妙讯管家': 'Miaoxun Butler',
    '系统通知': 'System Notices',
    '在线 · 管家中枢': 'Online - Butler Hub',
    '在线 · Agent': 'Online - Agent',
    '已停用': 'Disabled',
    '模块状态': 'Module Status',
    '会话': 'Conversation',
    'Agent 会话': 'Agent Conversation',
    '暂无消息': 'No messages',
    '刚刚': 'Just now',
    '已接入': 'Connected',
    '待接入': 'Pending',
    '待授权': 'Permission needed',
    '已授权': 'Authorized',
    '同步中': 'Syncing',
    '小站资料': 'Station Profile',
    '我的动态': 'Posts',
    '个人日记': 'Diary',
    '个人相册': 'Album',
    '喜欢的音乐菜单': 'Music Menu',
    '可调用能力': 'Callable capability',
    '可调用能力 Agent': 'Callable Agents',
    '社交网络': 'Social Network',
    '我的文件': 'Files',
    '3D名片': '3D Card',
    '漫画日记': 'Comic Diary',
    'AI伙伴': 'AI Partner',
    '可被调用': 'Callable',
    '默认形象': 'Default Look',
    '我的模样': 'My Look',
    '当前账号还没有上传素材和生成授权，所以只展示默认形象。':
      'This account has not uploaded assets or granted generation permission, so only the default look is shown.',
    '我今天的 OOTD': "Today's OOTD",
    '照片': 'Photos',
    '旅行': 'Travel',
    '生活': 'Life',
    '晨间灵感': 'Morning Ideas',
    '专注编码': 'Deep Work',
    '夜间漫游': 'Night Walk',
    '今日手账': 'Today Journal',
    '待接入日记生成任务。': 'Diary generation jobs are pending.',
    '连载日记': 'Serialized Diary',
    '待接入章节归档。': 'Chapter archive is pending.',
    '把聊天、内容、小站和 Agent 连在一起。': 'Connects chats, content, stations, and agents.',
    '云上社区': 'Cloud Community',
    '上海 · 徐汇': 'Shanghai - Xuhui',
    '我会承接你的消息、账号和小站能力。':
      'I will handle your messages, account, and station abilities.',
    '欢迎来到妙讯。我会先承接你的消息、账号和小站能力。':
      'Welcome to Miaoxun. I will first handle your messages, account, and station abilities.',
    '动态、文件和长期记忆模块等待数据库接入。':
      'Posts, files, and long-term memory are waiting for database integration.',
    '这个人还没有填写小站简介。': 'No station bio yet.',
    '后端健康检查和 PostgreSQL 连接正常。':
      'Backend health check and PostgreSQL connection are normal.',
    '需要补充授权、确认和审计流。':
      'Authorization, confirmation, and audit flows are pending.',
  };
  if (mappedValues[rawValue]) {
    return mappedValues[rawValue];
  }
  if (rawValue.endsWith('分钟前')) {
    return `${rawValue.replace('分钟前', '')}m ago`;
  }
  if (rawValue.endsWith('小时前')) {
    return `${rawValue.replace('小时前', '')}h ago`;
  }
  return rawValue;
};

export const authErrorText = (language: Language, message?: string | null) => {
  const value = String(message || '').toLowerCase();
  if (!value) {
    return '';
  }
  if (value.includes('account not found')) {
    return textFor(language, '账号不存在，请使用昵称、手机号或邮箱登录', 'Account not found. Use name, phone, or email');
  }
  if (value.includes('invalid password')) {
    return textFor(language, '密码错误', 'Incorrect password');
  }
  if (value.includes('user is disabled')) {
    return textFor(language, '账号已停用', 'Account disabled');
  }
  if (value.includes('phone number already registered')) {
    return textFor(language, '手机号已注册', 'Phone number is already registered');
  }
  if (value.includes('email already registered')) {
    return textFor(language, '邮箱已注册', 'Email is already registered');
  }
  if (value.includes('display name already registered')) {
    return textFor(language, '名称已使用', 'Name is already taken');
  }
  if (value.includes('phone number must be')) {
    return textFor(language, '请输入 11 位中国大陆手机号', 'Enter an 11 digit mainland China mobile number');
  }
  if (value.includes('password must include') || value.includes('password must be')) {
    return textFor(
      language,
      '密码至少 8 位，并且需要包含一个大写字母和一个小写字母',
      'Password must be at least 8 characters and include one uppercase and one lowercase letter',
    );
  }
  return message || textFor(language, '操作失败', 'Operation failed');
};
