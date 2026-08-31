export function surveyTimeRemaining(endsAt: string, now: number) {
  const milliseconds = Math.max(0, Date.parse(endsAt) - now);
  const totalMinutes = Math.floor(milliseconds / 60000);
  return {
    expired: milliseconds === 0,
    lessThanMinute: milliseconds > 0 && milliseconds < 60000,
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor(totalMinutes % 1440 / 60),
    minutes: totalMinutes % 60,
  };
}

export function remainingSurveyLabel(endsAt: string, now: number, language: 'en' | 'am') {
  const remaining = surveyTimeRemaining(endsAt, now);
  if (remaining.expired) return language === 'am' ? 'የዳሰሳ ጥናቱ ጊዜ አብቅቷል።' : 'The survey period has ended.';
  if (remaining.lessThanMinute) return language === 'am' ? 'ከአንድ ደቂቃ ያነሰ ጊዜ ቀርቷል።' : 'Less than 1 minute left.';
  const parts = [
    [remaining.days, language === 'am' ? 'ቀን' : remaining.days === 1 ? 'day' : 'days'],
    [remaining.hours, language === 'am' ? 'ሰዓት' : remaining.hours === 1 ? 'hour' : 'hours'],
    [remaining.minutes, language === 'am' ? 'ደቂቃ' : remaining.minutes === 1 ? 'minute' : 'minutes'],
  ].filter(([amount]) => Number(amount) > 0).map(([amount, unit]) => `${amount} ${unit}`).join(', ');
  return language === 'am' ? `${parts} ቀርቷል።` : `You have ${parts} left.`;
}
