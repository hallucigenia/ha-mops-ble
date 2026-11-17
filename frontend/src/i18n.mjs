const messages = {
  en: {
    air: 'Air', deviceInfo: 'Device information', model: 'Model', location: 'Location',
    connection: 'Connection', battery: 'Battery', charging: 'Charging', measured: 'Last measurement',
    periodic: 'Periodic measurement', periodicHint: 'Turn off for continuous measurement', interval: 'Measurement interval',
    history: 'PM2.5 history', trend: 'Trend', trendTitle: 'PM2.5 trend', range: 'History range',
    sixHours: '6 hours', day: '24 hours', recent: 'Last 6 hours', minimum: 'Minimum', maximum: 'Maximum',
    close: 'Close device information', collapse: 'Collapse history', expand: 'Expand PM2.5 history',
    product: 'White MOPS AD520-P001 air monitor with a central circular button and no screen',
    waiting: 'Waiting for a reading', stale: 'Waiting for a new sample', unavailable: 'Reading unavailable',
    disconnected: 'HA disconnected', online: 'Device reporting', offline: 'No current device data', unknown: 'Unknown',
    justNow: 'just now', minutesAgo: '{count} min ago', hoursAgo: '{count} h ago', daysAgo: '{count} d ago',
    sampleAge: 'Measured {age}', latest: 'Latest sample', sampleCount: '{count} samples',
    settingsUnknown: 'Measurement mode unavailable', continuous: 'Continuous measurement',
    periodicMode: 'Periodic measurement', every: 'Every {count} minutes', minutes: '{count} minutes',
    noHistory: 'No recorded history', historyPending: 'Loading history', historyError: 'History unavailable. Select to retry',
    historyLabel: 'Last {count} hours of PM2.5. Use arrow keys to select a sample',
    readingLabel: 'PM2.5 {value}. Expand history', sampleLabel: '{value} micrograms per cubic meter',
    chargeOn: 'Charging', chargeOff: 'Not charging', chargeUnknown: 'Charging status unknown',
    batteryUnknown: 'Battery unknown', batteryValue: 'Battery {value}', low: 'Low battery', critical: 'Very low battery',
    settingPending: 'Updating…', settingDone: 'Updated', settingTimeout: 'Setting not confirmed. Check the device before retrying',
    settingFailed: 'Update failed. Check the device before retrying',
  },
  'zh-Hans': {
    air: '空气', deviceInfo: '设备信息', model: '型号', location: '位置',
    connection: '连接', battery: '电量', charging: '充电', measured: '最近测量',
    periodic: '分时检测', periodicHint: '关闭后使用连续检测', interval: '检测间隔',
    history: 'PM2.5 历史', trend: '趋势', trendTitle: 'PM2.5 趋势', range: '历史时间范围',
    sixHours: '6 小时', day: '24 小时', recent: '近 6 小时', minimum: '最低', maximum: '最高',
    close: '关闭设备信息', collapse: '收起历史', expand: '展开 PM2.5 历史',
    product: 'MOPS 忻风白色方形空气检测仪，中央圆形按钮，无屏幕',
    waiting: '等待读数', stale: '等待新测量', unavailable: '读数暂不可用',
    disconnected: 'HA 连接中断', online: '设备正在上报', offline: '暂无设备数据', unknown: '状态未知',
    justNow: '刚刚', minutesAgo: '{count} 分钟前', hoursAgo: '{count} 小时前', daysAgo: '{count} 天前',
    sampleAge: '{age}测量', latest: '最近测量', sampleCount: '{count} 次测量',
    settingsUnknown: '检测模式待更新', continuous: '连续检测',
    periodicMode: '分时检测', every: '每 {count} 分钟检测', minutes: '{count} 分钟',
    noHistory: '暂无历史数据', historyPending: '正在读取历史', historyError: '历史暂不可用，点击重试',
    historyLabel: '近 {count} 小时 PM2.5 历史，左右方向键查看测点',
    readingLabel: 'PM2.5 {value}，展开历史', sampleLabel: '{value} 微克每立方米',
    chargeOn: '正在充电', chargeOff: '未充电', chargeUnknown: '充电状态未知',
    batteryUnknown: '电量未知', batteryValue: '电量 {value}', low: '电量偏低', critical: '电量很低',
    settingPending: '正在设置…', settingDone: '已更新', settingTimeout: '设置未确认，请检查设备后重试',
    settingFailed: '设置失败，请检查设备后重试',
  },
};

export function language(config, hass) {
  const requested = config?.language === 'auto' || !config?.language
    ? hass?.locale?.language || hass?.language || 'en' : config.language;
  return /^zh(?:-|$)/i.test(requested) ? 'zh-Hans' : 'en';
}

export function translate(locale, key, values = {}) {
  return (messages[locale]?.[key] ?? messages.en[key] ?? key)
    .replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

export const translationKeys = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, Object.keys(value).sort()]));
