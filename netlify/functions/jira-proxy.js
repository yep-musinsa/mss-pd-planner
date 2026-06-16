exports.handler = async (event) => {
  const path = event.path.replace('/.netlify/functions/jira-proxy', '');
  const query = event.rawQuery ? `?${event.rawQuery}` : '';
  const url = `https://jira.team.musinsa.com${path}${query}`;

  const response = await fetch(url, {
    method: event.httpMethod,
    headers: {
      'Authorization': event.headers['authorization'] || '',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Atlassian-Token': 'no-check',
    },
    body: event.body || undefined,
  });

  const body = await response.text();

  return {
    statusCode: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body,
  };
};
