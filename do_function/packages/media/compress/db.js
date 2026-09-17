const axios = require("axios");

async function updateMediaStatus(mediaId, status, compressedPath) {
  if (!process.env.GRAPHQL_ENDPOINT) {
    console.warn("No GRAPHQL_ENDPOINT set. Skipping DB update.");
    return;
  }
  
  // Example GraphQL mutation based on the schema document
  const query = `
    mutation UpdateMedia($id: uuid!, $status: media_compression_status!, $path: String) {
      update_media_by_pk(pk_columns: {id: $id}, _set: {status: $status, compressed_path: $path}) {
        id
      }
    }
  `;

  try {
    await axios.post(
      process.env.GRAPHQL_ENDPOINT,
      {
        query,
        variables: { id: mediaId, status: status, path: compressedPath }
      },
      {
        headers: {
          "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET || "",
        }
      }
    );
    console.log(`Successfully updated media ${mediaId} to ${status}`);
  } catch (error) {
    console.error("DB Update failed:", error?.response?.data || error.message);
  }
}

module.exports = { updateMediaStatus };
