module github.com/finance_next/gateway

go 1.25.0

// Pull the shared-proto generated stubs from the sibling directory rather
// than fetching them via go.work or a public module path. This keeps the
// build deterministic both inside Docker (where the build context copies
// shared-proto/ alongside gateway/) and from a developer machine.
replace github.com/finance_next/shared-proto => ../shared-proto

require (
	github.com/adshao/go-binance/v2 v2.8.11
	github.com/coder/websocket v1.8.14
	github.com/finance_next/shared-proto v0.0.0-00010101000000-000000000000
	github.com/go-playground/validator/v10 v10.30.2
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.7.1
	github.com/joho/godotenv v1.5.1
	github.com/labstack/echo/v4 v4.15.2
	go.mongodb.org/mongo-driver/v2 v2.6.0
	google.golang.org/grpc v1.81.0
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/bitly/go-simplejson v0.5.0 // indirect
	github.com/gabriel-vasile/mimetype v1.4.13 // indirect
	github.com/go-playground/locales v0.14.1 // indirect
	github.com/go-playground/universal-translator v0.18.1 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/jpillora/backoff v1.0.0 // indirect
	github.com/klauspost/compress v1.17.6 // indirect
	github.com/kr/text v0.2.0 // indirect
	github.com/labstack/gommon v0.5.0 // indirect
	github.com/leodido/go-urn v1.4.0 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.22 // indirect
	github.com/rogpeppe/go-internal v1.14.1 // indirect
	github.com/shopspring/decimal v1.4.0 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	github.com/xdg-go/pbkdf2 v1.0.0 // indirect
	github.com/xdg-go/scram v1.2.0 // indirect
	github.com/xdg-go/stringprep v1.0.4 // indirect
	github.com/youmark/pkcs8 v0.0.0-20240726163527-a2c0da244d78 // indirect
	golang.org/x/crypto v0.50.0 // indirect
	golang.org/x/net v0.53.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.43.0 // indirect
	golang.org/x/text v0.36.0 // indirect
	golang.org/x/time v0.15.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260226221140-a57be14db171 // indirect
)
