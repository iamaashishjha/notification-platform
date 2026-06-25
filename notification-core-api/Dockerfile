FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod ./
RUN go mod download
COPY . .
ARG CMD=api
RUN go build -o /out/app ./cmd/${CMD}

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S app -G app
COPY --from=build /out/app /app/app
RUN chown -R app:app /app
USER app
EXPOSE 8080
ENTRYPOINT ["/app/app"]
