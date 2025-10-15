dev-compose:
	docker-compose --env-file .env.dev -f docker/docker-compose.dev.yml up -d

hasura_apply:
	docker compose --env-file .env.dev exec console \
		sh -c "hasura-cli metadata apply --endpoint=http://graphql:8080 && \
					 hasura-cli migrate apply --database-name 'default' --endpoint=http://graphql:8080"
dev:
	make dev-compose
	pnpm run dev

prod:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d

prod-down:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml down

prod-rebuild:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build --force-recreate

deploy:
	make prod-down
	git pull
	make prod-rebuild
