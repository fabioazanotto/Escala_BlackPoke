# Decisões e pendências do sistema de escalas

Sem dados pessoais: este arquivo está num repositório público.

## Decididas
- **Cargo e função são coisas diferentes.** Cargo é o que está na planilha; função é o posto
  coberto. Cargos diferentes podem ter a mesma função (ex.: "ajd cozinha" e "aux cozinha"
  são Ajudante de cozinha).
- Auxiliar de sushi tem função própria e **não** cobre sushiman por padrão.
- O "cozinheiro líder" do BlackPoke no turno noturno de Santos é o cozinheiro do BlackPoke exigido.
- Colaboradores são identificados por nome + unidade até haver CPF ou matrícula.

## Pendentes
- **Dobra entre sushimans (combinado interno):** na folga de um sushiman, o outro cobre
  fazendo os dois turnos no dia. Isso entra em conflito com "turno fixo", com "não abrir e
  fechar no mesmo dia" e provavelmente com limites legais de jornada e descanso entre
  jornadas. Não será aplicado automaticamente: o motor (etapa 4) deve tratá-lo como exceção
  explícita, marcada como conflito, até a regra ser validada com o contador/convenção coletiva.
- Valores da cobertura mínima reduzida, intervalos intrajornada, feriados.
- Convenção coletiva aplicável.
