import got from 'got';
import middleware from './_common/middleware.js';

const redirectsHandler = async (url) => {
  const redirects = [];
  try {
    const response = await got(url, {
      followRedirect: true,
      maxRedirects: 12,
      hooks: {
        beforeRedirect: [
          (options, response) => {
            redirects.push({
              statusCode: response.statusCode,
              url: response.headers.location || options.url?.href || 'Unknown'
            });
          },
        ],
      },
    });

    // Add final destination
    redirects.push({
      statusCode: response.statusCode,
      url: response.url
    });

    return {
      redirects: redirects,
    };
  } catch (error) {
    throw new Error(`Error: ${error.message}`);
  }
};

export const handler = middleware(redirectsHandler);
export default handler;

