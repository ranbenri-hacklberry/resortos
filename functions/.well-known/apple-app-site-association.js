export function onRequest(context) {
  const team = String(context.env?.APPLE_TEAM_ID || 'TEAMID').trim();
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${team}.il.resortos.app`],
          components: [
            { '/': '/app/charge*' }
          ]
        }
      ]
    }
  };
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300'
    }
  });
}
