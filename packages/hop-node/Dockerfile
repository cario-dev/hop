FROM node:20.12.2-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

RUN pnpm --filter=sdk-core build
RUN pnpm --filter=sdk build
RUN pnpm --filter=hop-node-core build
RUN pnpm --filter=hop-node build
RUN pnpm --filter=hop-node deploy --prod /prod/app

FROM base
COPY --from=build /prod/app /prod/app
WORKDIR /prod/app

ARG GIT_REV
ENV GIT_REV=${GIT_REV}

ENTRYPOINT ["node", "/prod/app/dist/cli/cli.js"]
