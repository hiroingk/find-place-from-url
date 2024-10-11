import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { PlacesClient } from "@googlemaps/places";
import OpenAI from "openai";

const openai = new OpenAI();
const placesClient = new PlacesClient({
  apiKey: process.env.MAPS_API_KEY,
});
const jinaApiKey = process.env.JINA_API_KEY;

const app = new Hono();

app.post("/", async (c) => {
  const { url } = await c.req.json();
  if (!url) {
    return c.json({ error: "url is required" }, 400);
  }

  // URLからお店の情報を取得
  const webSiteReader = await fetch("https://r.jina.ai/" + url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + jinaApiKey,
    },
  });
  const webSiteReaderData = await webSiteReader.json();
  console.log("webSiteReaderData", webSiteReaderData);

  // AIでお店の名前を生成
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content:
          "テキストを元に、文章が指し示すお店の名前を生成してください。また、文章がお店の名前をさし示していない場合は、投稿するアカウントのユーザー名をお店の名前として生成してください。結果として出力するときは、Google Maps Places APIにリクエストを送信するためのテキストだけを出力してください。お店の名前が複数個見つかった場合は、先頭の名前だけを出力してください。お店の名前が見つからなかった場合は、'not found'と出力してください。",
      },
      {
        role: "user",
        content: JSON.stringify(webSiteReaderData),
      },
    ],
  });
  console.log("completion", completion);

  const name = completion.choices[0].message.content;
  if (name === "not found") {
    return c.json({ error: "not found" }, 400);
  }
  console.log("name: ", name);

  // Google Maps Places APIにリクエストを送信
  const request = {
    textQuery: name as string,
    languageCode: "ja",
  };
  const mapResponse = await placesClient.searchText(request, {
    otherArgs: {
      headers: {
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.priceLevel,places.location",
      },
    },
  });
  return c.json(mapResponse);
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
