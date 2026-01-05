import axios from 'axios';
import middleware from './_common/middleware.js';

const qualityHandler = async (url, event, context) => {
    // Use PSI_API_KEY which is already configured in .env for PageSpeed Insights
    const apiKey = process.env.PSI_API_KEY;

    if (!apiKey) {
        throw new Error(
            'Missing Google PageSpeed API. You need to set the `PSI_API_KEY` environment variable'
        );
    }

    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?`
        + `url=${encodeURIComponent(url)}&category=PERFORMANCE&category=ACCESSIBILITY`
        + `&category=BEST_PRACTICES&category=SEO&category=PWA&strategy=mobile`
        + `&key=${apiKey}`;

    return (await axios.get(endpoint)).data;
};

export const handler = middleware(qualityHandler);
export default handler;
