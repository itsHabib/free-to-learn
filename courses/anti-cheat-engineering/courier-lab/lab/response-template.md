# My proximity-rule reasoning

Help used (also pass an accurate --assistance value when submitting):

## Decisions before editing

- 250 mm east, 0 north — decision and reason:
- 251 mm east, 0 north — decision and reason:
- 150 mm east, 200 mm north — decision and reason:
- 200 mm east, 200 mm north — decision and reason:

## Explanation after testing

1. Why would a browser-only distance check leave the server vulnerable to remote pickup?

2. A valid request arrives twice after a connection interruption. Why should the retry be a no-op without becoming a cheating finding?

3. A modified client sends exactly the same legal messages as an ordinary client. What does this server observe? What does it fail to establish?

4. Transfer: a repair station has a radius of 400 mm and a resource cost. Outline a server-owned predicate and one legal boundary test, one invalid-state test and one retry test. Account for charging the resource at most once.
