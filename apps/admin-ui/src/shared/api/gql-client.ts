import { GraphQLClient, graphqlWS } from '@refinedev/hasura';
import { authService } from '../auth';

const API_URL = 'http://local.graphql.local.nhost.run/v1/graphql';
const WS_URL = 'ws://local.graphql.local.nhost.run/v1/graphql';

export const gqlClient = new GraphQLClient(API_URL, {
  // headers: {
  //   // 'x-hasura-role': 'public',
  // },
  requestMiddleware: async (req) => {
    if (!(req.headers instanceof Headers)) {
      req.headers = new Headers(req.headers as HeadersInit);
    }
    const token = await authService.getAccessToken();
    if (token) {
      req.headers.set('Authorization', `Bearer ${token}`);
      req.headers.set('x-hasura-role', 'staff');
    }
    return req;
  },
});

export const webSocketClient = graphqlWS.createClient({
  url: WS_URL,
});
