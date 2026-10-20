"""Inline data.json into page.html: docs/quiz/index.html for Pages, quiz/artifact.html for claude.ai."""
import os
H = os.path.dirname(os.path.abspath(__file__))
page = open(os.path.join(H, 'page.html')).read().replace('__DATA__', open(os.path.join(H, 'data.json')).read())
open(os.path.join(H, 'artifact.html'), 'w').write(page)
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Anime quizzes built on real cover art, character portraits and scenes, with a kyu/dan grade at the end.">\n')
title_end = page.index('</style>') + len('</style>')
open(os.path.join(os.path.dirname(H), 'docs/quiz/index.html'), 'w').write(
    head + page[:title_end] + '\n</head>\n<body>\n' + page[title_end:] + '\n</body>\n</html>\n')
