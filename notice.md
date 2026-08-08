# web-streaming -- notice

welcome to web-streaming beta

i am a solo dev with no money or servers. i want to make a simple streaming site that simply works.

- simply doesn't spam ads
- simply doesn't break half the time
- simply just works

currently everything runs with no budget. hosted on render's free tier. i want to get my own domain and proper hosting eventually, but for now this works.

---

## architecture

```
browser -> render (express.js) -> free embed apis -> iframe player
```

no p2p. no torrents. no api keys. just embeds.

## apis used (all free)

- imdb suggestion api -- search
- wikipedia rest api -- plot summaries
- tvmaze api -- episode guides
- 2embed.cc -- video embedding

## file structure

```
public/           frontend spa
server/           express api
  routes/         endpoint handlers
  middleware/     auth, rate limiting
  services/       data layer
vendor/           vendored dependencies
```

---

built solo with no budget. if this helped you, star the repo.
