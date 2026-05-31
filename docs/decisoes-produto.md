# Bamboo — Registro de Decisões de Produto

> Documento vivo. Compila as decisões tomadas no brainstorm inicial.
> Status: exploração / pré-MVP. Nada aqui é imutável — é um ponto de partida organizado.
> Relacionados: [[plano-de-build]] (técnico) · [[plano-implementacao-fase0-fase1]] (execução) · [[schema.ts]] (modelo).

---

## 1. Visão e modelo de negócio

- **B2B2C**: a nutricionista paga o SaaS; o paciente usa de graça. A nutri paga por pool de pacientes/mês (valor fixo + por paciente, ou algo próximo — **a definir**).
- **Web/desktop** para a nutri (gestão, plano, agenda, relatórios). **App mobile** para o paciente (e eventualmente para a nutri).
- **Insight estratégico:** a retenção do paciente é o que segura a retenção da nutri. Paciente engajado → nutri que não cancela. O lado do paciente é, no fim, o que defende o negócio.
- **Sequência:** validar primeiro com MVP web antes de investir pesado no mobile.

---

## 2. Tese central

- O trabalho do paciente é **seguir + adequar**: seguir o plano *e* adaptá-lo aos imprevistos e vontades do dia a dia.
- O valor **não** é *ver* o plano (isso é commodity, todo concorrente faz). O valor é **adaptar** o plano à vida real — a camada que negocia o plano com o dia do paciente.
- Os recursos de *adequar* (substituição, rebalanceamento, autonomia) são o que faz os de *seguir* sobreviverem ao contato com a vida real. Plano rígido é abandonado; plano que dobra sem quebrar é o que se mantém nos ~80% de adesão.

---

## 3. Lado do paciente (app mobile)

### Tela inicial / consulta
- Momento de uso dominante = **consulta** ("o que como agora?"), não registro.
- Home = **o agora**: o app entrega a refeição do momento, sem o paciente caçar nada.
- Registro/log é secundário e **pendurado na consulta**: um toque em "feito / troquei / pulei" captura adesão como subproduto, nunca um formulário separado.

### Acesso offline
- O plano é *read-mostly*: cachear localmente o plano ativo + listas de substituição + dados nutricionais.
- Logs são *append-only*: fila de sincronização offline, conflito quase trivial.
- O cálculo de substituição precisa funcionar **100% offline** (é no restaurante sem sinal que mais se precisa dele).

### Substituição
- Modelo **híbrido**: a nutri define os graus de liberdade; o app faz a conta.
- Quantidades **recalculadas automaticamente** (mata a "conta de cabeça").
- Brasil: **medidas caseiras** (gramas → colheres/conchas) e base **TACO** como ponto de partida gratuito.
- **Substituição em combinação**: trocar um alimento por dois (ex.: macarrão → arroz **e** batata), com o app distribuindo as quantidades pra bater o alvo. Padrão meio-a-meio, com ajuste tipo "mais arroz, menos batata".

### Rebalanceamento (o motor)
- **Um motor só, alimentado por vários gatilhos:**
  1. troca dentro do grupo (equivalente) → não mexe no macro, não rebalanceia.
  2. escolher entre opções pré-montadas desiguais (ex.: 3 almoços) → espalha a diferença nas próximas refeições.
  3. registrar o que comeu de fato (inclusive fora da lista) → recalcula o resto do dia.
  4. trocar o tipo-de-dia → mesmo motor.
- **Alvo por nutriente, não por caloria só**: preserva o que a nutri travou (piso de proteína, vegetais, etc.); só mexe nas alavancas liberadas.
- **Piso inviolável**: o motor nunca manda passar fome pra compensar. Se o desvio não cabe, ele recusa e diz "hoje ficou acima, segue leve e volta amanhã".
- **Normalizar um deslize é feature, não falha** (a própria nutri fala em 80% → 20% de folga é parte do método). Evita o tudo-ou-nada que destrói a semana.
- **Avisa, não surpreende**: mostra a consequência *antes* de o paciente escolher/agir ("esse almoço deixa o jantar assim"). É a resposta ao "posso comer isso?".
- A ideia de **"bucket de calorias em %"** foi **descartada** — vira número pra sentir culpa. O rebalanceamento dá ação pra executar, que é o que o paciente quer no momento da decisão.

### Cardápios por tipo de dia
- O plano não é um cardápio fixo: é um **conjunto de tipos-de-dia** (treino pesado / leve / descanso), porque a alimentação varia conforme a atividade.
- A nutri define uma **programação default** (descoberta na anamnese).
- O app **mostra o default direto** (assume rotina), mas **anunciado** ("Hoje: dia de treino") — nunca silencioso, senão a pessoa come errado sem perceber.
- A troca é **um toque** no próprio rótulo, nunca uma tela que barra.
- Duas camadas de flexibilidade: **grossa** (qual cardápio do dia) + **fina** (substituir/rebalancear dentro dele).

### Registro / adesão
- Métrica de adesão **só para a nutri** no início (evita auto-policiamento e desânimo).
- Mede "**% da intenção nutricional do dia cumprida**", não "% idêntico ao papel" — substituições e rebalanceamentos corretos **contam como aderentes**.
- Se exposta ao paciente depois (via gate da nutri), o enquadramento importa: "80%, no caminho", nunca "62%, falhou".

### Cuidados de bem-estar (transversais)
- **Faixa-alvo, não teto**: comer de menos é tão fora de adesão quanto comer de mais. Diferencia de apps de contagem.
- Nada de gamificação de restrição ou contagem obsessiva.
- **Gate de exposição** (controlado pela nutri): oculto / só % / % + macros / kcal cheio — por paciente.

---

## 4. Lado da nutri (web)

### Posicionamento vs. mercado
- Mercado **maduro e lotado** (Dietbox, Nutrium, WebDiet, DietSystem, etc.). Não dá pra ganhar na **commodity** (editor de plano, agenda, prontuário, bases de alimentos).
- Diferenciar na **camada de autonomia + rebalanceamento + ciclo**.
- Dores reais do Dietbox (= brecha, porque são tarefas centrais do dia, não estética): caçar o cardápio do dia, substituição morosa, conta de cabeça, "só um consultador de cardápio meia-boca".

### Entrada do plano (NÃO é um editor)
- Foco zero em ser editor de plano (não brigar com Dietbox nisso). Mas **foco total em como o plano entra** — porque o motor precisa do plano como **dado organizado e marcado**.
- **Import assistido por IA**: a nutri sobe o PDF/print do plano que já usa → a IA estrutura em refeições/alimentos/quantidades → ela **revisa, corrige e marca a flexibilidade**.
- **Etapa de confirmação da nutri é obrigatória** (é plano de saúde; mantém controle clínico e protege contra erro de IA). Revisão, nunca digitação do zero.

### Configuração de flexibilidade
- Adotar o **Modelo 1 — lista de substituição / equivalência** (o que a nutri já usa há décadas; zero curva de aprendizado).
- **"Sem enlouquecer"**: o sistema **pré-classifica** cada alimento no seu grupo de substituição automaticamente (viável por semelhança nutricional). A nutri só **mexe no cadeado das exceções** (trava o shake pós-treino) e ajusta a folga.
- Padrão de UI: **cadeado por alimento/refeição** (trava o fixo, libera o resto) — inspirado em apps de macro tipo Eat This Much / Swole.me.
- Dois tipos de variedade (pra não afogar a nutri):
  - **opção** = refeição de *formato diferente* (almoço de macarrão vs. de salada) → ela monta poucas.
  - **substituição de grupo** = variedade *dentro* do formato → vem de graça dos grupos.

### Painel do paciente
- Estrutura = prontuário (plano + contato + nome + peso + altura) — construir **enxuto**, é commodity.
- A flexibilidade mora em **camadas**:
  - **Perfil do paciente** (regras gerais da anamnese: alergias, o que não come, quanta autonomia aguenta, **nível de exposição**) → define uma vez.
  - **Plano, por alimento** (cadeados + grupos, pré-preenchidos, herdam o perfil) → só corrige.
- O painel vira o **lugar único** de tudo que é por-paciente: plano + dados + perfil de flexibilidade + exposição.

### Ciclo de acompanhamento
- **Objeto de primeira classe**: início (consulta + plano) → duração → fim (reavaliação + relatório). Plano **versionado por ciclo**.
- **Autonomia entre consultas**: o paciente se vira sozinho dentro das regras; a nutri **revisa olhando pra trás** no fim do ciclo. Sem ping em tempo real (vira ruído).
- Exceção: **detector de fumaça calibrado alto** — só sinaliza se um padrão cruzar algo clinicamente sério antes da consulta.

### Relatório de ciclo (a feature que mais vende pra nutri)
- Transforma comportamento acumulado em **insight pronto pra consulta** ("o que funcionou / o que mudar"), não diário cru.
- Mostra: adesão ao longo do tempo (linha dos 80%), quais refeições mais apanham, quais substituições o paciente puxa, quando os imprevistos se concentram, frequência de "não deu pra rebalancear".
- **Flywheel**: plano → paciente vive com autonomia → app captura comportamento → nutri vê a verdade → próximo plano melhor → mais adesão.

---

## 5. Padrão de interação (a "assinatura" do produto)

> **"Mostra o certo por padrão, deixa trocar num toque, nunca barra."**

Aparece em todo lugar: tela inicial (serve o agora), tipo-de-dia (default anunciado + troca), rebalanceador (autonomia + detector de fumaça), opções de refeição. Dá uma personalidade coerente que o Dietbox não tem — o app inteiro "pensa" do mesmo jeito.

---

## 6. Stack técnica (decidida)

- **Backend:** Node.js + TypeScript + NestJS + PostgreSQL + Drizzle ORM
- **Web (nutri):** Next.js
- **Mobile:** React Native + Expo
- **Monorepo:** Turborepo
- **Deploy:** Railway/Render + Vercel + Expo EAS — **a definir**

---

## 7. Decisões parqueadas (pra depois)

- **Pagamento paciente→nutri:** a nutri processa o pagamento do paciente dentro do app, via integração externa que gera link de pagamento por cartão (ex.: Stripe Connect / Asaas / Pagar.me). Separar dos dois fluxos de dinheiro: nutri→você (assinatura) vs. paciente→nutri (consultoria).
- **Modelo de billing (dois caminhos):**
  - *Assinatura* (fixo + por paciente) — modelo-ferramenta, bate com o produto atual.
  - *Hub/marketplace* (comissão na consulta) — teto maior, mas GTM difícil e risco de a nutri tirar a cobrança do app. Pode ser **camada de expansão** futura sobre a base já formada.
- **Stripe + Pix** (mercado BR) — a definir.

---

## 8. Em aberto / próximas decisões

- [ ] **Nicho do MVP**: emagrecimento? atleta? profissional sem tempo? (a tese de flexibilidade brilha mais em algum perfil)
- [ ] **Escopo da "laje fina"**: quanto de commodity construir pra ser crível sem virar clone pior do Dietbox.
- [ ] **Telas**: rascunhar a tela do paciente (agora + 3 opções com efeito no dia + cadeado) e a tela de flexibilidade da nutri.
- [ ] **Registro de comida fora da lista** (caso "aberto"): base de alimentos + casamento de texto + estimativa por IA + piso. Fast-follow, não MVP-crítico.
- [ ] **Como o app sabe o tipo-de-dia** quando foge da rotina (declaração manual já decidida como override; integração com wearable/calendário fica pra depois).
