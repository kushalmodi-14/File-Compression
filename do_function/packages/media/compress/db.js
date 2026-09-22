const axios = require("axios");

function getGraphqlEndpoint() {
  const isProd = process.env.enviorments === 'production';
  if (isProd) {
    return process.env.PROD_GRAPHQL_ENDPOINT;
  }
  return process.env.STAGGING_GRAPHQL_ENDPOINT || process.env.GRAPHQL_ENDPOINT;
}

async function updateMediaStatus(mediaId, status, compressedPath) {
  const graphqlEndpoint = getGraphqlEndpoint();

  if (!graphqlEndpoint) {
    console.warn(`No GRAPHQL_ENDPOINT set. Skipping DB update.`);
    return;
  }
  
  // Example GraphQL mutation based on the schema document
  const query = `
    mutation UpdateMedia($id: String!, $set: MediaUpdateInput!) {
  updateMedia(where: {id: {eq: $id}}, set: $set) {
    id
    status
  }
}
  `;

  try {
    await axios.post(
      graphqlEndpoint,
      {
        query,
        variables: {
            id: mediaId,
            set: {
                status: status,
                updatedAt: new Date().toISOString(),
                compressedPath: compressedPath
            }
        }
      },
    );
    console.log(`Successfully updated media ${mediaId} to ${status}`);
  } catch (error) {
    console.error("DB Update failed:", error?.response?.data || error.message);
  }
}

module.exports = { updateMediaStatus };
