const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateReportAI(reportData) {
  const { client, period_start, period_end, agency_name, platforms_data } = reportData;

  // Build platform summary string
  const platformLines = [];
  const pd = platforms_data;

  if (pd.instagram?.enabled) {
    platformLines.push(`Instagram:
  - Followers: ${pd.instagram.followers || 'N/A'} (${pd.instagram.followers_change || '0'}% change)
  - Reach: ${pd.instagram.reach || 'N/A'}
  - Impressions: ${pd.instagram.impressions || 'N/A'}
  - Engagement Rate: ${pd.instagram.engagement_rate || 'N/A'}%
  - Top post description: ${pd.instagram.top_post || 'Not provided'}
  - Reels plays: ${pd.instagram.reels_plays || 'N/A'}`);
  }

  if (pd.youtube?.enabled) {
    platformLines.push(`YouTube:
  - Subscribers: ${pd.youtube.subscribers || 'N/A'} (${pd.youtube.subscribers_change || '0'}% change)
  - Views: ${pd.youtube.views || 'N/A'}
  - Watch time (hours): ${pd.youtube.watch_time || 'N/A'}
  - Top video: ${pd.youtube.top_video || 'Not provided'}`);
  }

  if (pd.facebook?.enabled) {
    platformLines.push(`Facebook:
  - Page likes: ${pd.facebook.page_likes || 'N/A'}
  - Reach: ${pd.facebook.reach || 'N/A'}
  - Engagement: ${pd.facebook.engagement || 'N/A'}`);
  }

  if (pd.linkedin?.enabled) {
    platformLines.push(`LinkedIn:
  - Followers: ${pd.linkedin.followers || 'N/A'}
  - Impressions: ${pd.linkedin.impressions || 'N/A'}
  - Engagement Rate: ${pd.linkedin.engagement_rate || 'N/A'}%`);
  }

  if (pd.twitter?.enabled) {
    platformLines.push(`Twitter/X:
  - Followers: ${pd.twitter.followers || 'N/A'}
  - Impressions: ${pd.twitter.impressions || 'N/A'}
  - Engagement Rate: ${pd.twitter.engagement_rate || 'N/A'}%`);
  }

  if (pd.meta_ads?.enabled) {
    platformLines.push(`Meta Ads:
  - Ad Spend: ₹${pd.meta_ads.spend || '0'}
  - Clicks: ${pd.meta_ads.clicks || 'N/A'}
  - CTR: ${pd.meta_ads.ctr || 'N/A'}%
  - ROAS: ${pd.meta_ads.roas || 'N/A'}x
  - Conversions: ${pd.meta_ads.conversions || 'N/A'}`);
  }

  const userMessage = `
Agency Name: ${agency_name}
Client: ${client.name}
Industry: ${client.industry || 'Not specified'}
Report Period: ${period_start} to ${period_end}

Platform Data:
${platformLines.join('\n\n')}

Additional Notes from agency: ${reportData.notes || 'None'}

Generate a professional monthly social media performance report commentary for this client.
`;

  const systemPrompt = `You are a senior social media strategist writing a monthly performance report for an agency's client. Your tone is professional, insightful, and actionable. You write as if you are part of the agency team presenting results.

You MUST respond with ONLY a valid JSON object. No markdown. No preamble. No text outside the JSON.

Return exactly this structure:
{
  "headline": "Short punchy headline summarizing the month (max 12 words)",
  "performance_grade": "A+|A|B+|B|C|Needs Work",
  "executive_summary": "2-3 sentence summary of overall performance. Mention key wins. Be specific with numbers where available.",
  "platform_highlights": [
    {
      "platform": "Platform name",
      "summary": "2 sentence platform-specific insight",
      "key_metric": "The single most impressive metric",
      "trend": "up|down|stable"
    }
  ],
  "what_worked": [
    "Specific insight 1 with data",
    "Specific insight 2 with data",
    "Specific insight 3 with data"
  ],
  "what_to_improve": [
    "Specific improvement suggestion 1",
    "Specific improvement suggestion 2",
    "Specific improvement suggestion 3"
  ],
  "next_month_goals": [
    "Concrete goal 1 with a target metric",
    "Concrete goal 2 with a target metric",
    "Concrete goal 3 with a target metric"
  ],
  "closing_note": "1-2 sentence closing thought that leaves the client feeling positive and confident in the agency."
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  const rawText = message.content[0].text.trim();

  // Strip any accidental markdown fences
  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  return parsed;
}

module.exports = { generateReportAI };
