const axios = require("axios");

async function updateMediaStatus(mediaId, status, compressedPath) {
  if (!process.env.GRAPHQL_ENDPOINT) {
    console.warn("No GRAPHQL_ENDPOINT set. Skipping DB update.");
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
      process.env.GRAPHQL_ENDPOINT,
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
