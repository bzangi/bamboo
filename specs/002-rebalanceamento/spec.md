# Feature Specification: Motor de rebalanceamento — negociar o dia

**Feature Branch**: `002-rebalanceamento`

**Created**: 2026-05-31

**Status**: Draft

**Input**: User description: "Fase 2 — o motor de rebalanceamento: um motor único alimentado por gatilhos (escolher opção desigual, combinação 1→2, troca de tipo-de-dia). Alvo por nutriente derivado das opções default, faixa-alvo (não teto), piso inviolável com recusa orientada, prévia antes de confirmar, ação não número."

## Visão geral

A Fase 1 entrega **ver "o agora"** e **substituir um alimento dentro do grupo** (troca equivalente, 1→1). Esta feature entrega o **motor que adapta o resto do dia** quando o paciente desvia do plano — a alça que transforma um "consultador de cardápio" num **negociador do dia**. A tese: plano que dobra sem quebrar sustenta a adesão; o valor é **adaptar**, não exibir.

**Um motor só, vários gatilhos.** O mesmo cálculo de domínio é alimentado por três gatilhos nesta feature:

1. **Escolher outra opção/prato** de uma refeição (os "3 almoços" desiguais) — recalcula **todos os macros** e espalha a diferença nas refeições seguintes. _(P1)_
2. **Combinação** — trocar 1 alimento por 2 (ex.: macarrão → arroz + batata), preservando **um** nutriente (a base do grupo). _(P2)_
3. **Trocar o tipo-de-dia** (o cardápio do dia inteiro) — o motor trabalha no **total do dia**. _(P3, com restrição de escopo no app v0 — ver US3.)_

Dois modos de balanceamento, decisão de produto:

- **Troca de item dentro da refeição** (a substituição da Fase 1 e a combinação P2): preserva **um** nutriente (a base do grupo) e **não** rebalanceia múltiplas refeições.
- **Troca de opção/prato inteiro** (P1) ou de **tipo-de-dia** (P3): recalcula **todos os macros** e espalha nas refeições seguintes.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Escolher outra opção e ver o efeito no resto do dia (Priority: P1)

O paciente está vendo uma refeição que tem mais de uma opção pré-montada (ex.: três almoços de pesos diferentes). Ao **escolher uma opção diferente da default** — mais pesada ou mais leve —, antes de confirmar ele vê a **prévia**: como ficam as refeições **seguintes** do dia para o total voltar à faixa-alvo ("esse almoço deixa o jantar assim"). Ele confirma e a refeição + as seguintes refletem o novo balanço; ou desiste e nada muda. Se o desvio é grande demais para caber sem cruzar o piso, o motor **recusa e orienta** em vez de aplicar um corte que machuca.

**Why this priority**: É o coração da Fase 2 — a primeira prova viva de que o app **negocia o dia**, não só exibe. Entrega valor sozinha: a capacidade de calcular o efeito de uma escolha e mostrá-lo antes de confirmar já existe e é verificável de ponta a ponta (motor + contrato), mesmo antes da tela final. A regra de **troca de tipo-de-dia no nível do motor** (total do dia) é construída e testada junto, por ser o mesmo cálculo.

**Independent Test**: Com um plano semeado em que uma refeição tem ≥2 opções de pesos diferentes e há refeições seguintes com itens flexíveis, disparar a escolha de uma opção não-default e confirmar que o sistema devolve (a) o novo balanço da refeição escolhida e (b) a prévia das refeições seguintes recalculadas para trazer o dia de volta à faixa — ou uma recusa orientada quando o desvio não cabe. Verificável pelo cálculo do motor e pelo contrato, sem a tela.

**Acceptance Scenarios**:

1. **Given** uma refeição com opção default e ao menos uma opção mais pesada, e refeições seguintes com itens flexíveis com folga acima do piso, **When** o paciente escolhe a opção mais pesada, **Then** o sistema apresenta uma **prévia** com as quantidades recalculadas dos itens flexíveis das refeições **seguintes** (position maior que a refeição do gatilho), de modo que o total do dia por nutriente volte para dentro da **faixa-alvo**, sem alterar itens travados nem itens sem grupo.
2. **Given** a prévia de rebalanceamento exibida, **When** o paciente confirma, **Then** a refeição escolhida e as refeições seguintes passam a refletir o novo balanço (estado local; nada é persistido no v0).
3. **Given** a prévia de rebalanceamento exibida, **When** o paciente desiste, **Then** nada muda — o dia permanece como antes da escolha.
4. **Given** uma opção escolhida cujo desvio em relação ao default **cabe dentro da faixa-alvo** sem precisar de ajuste, **When** o paciente a escolhe, **Then** o sistema confirma a troca **sem** alterar as refeições seguintes (nenhum rebalanceamento necessário).
5. **Given** uma opção escolhida cujo desvio **não cabe** nas alavancas disponíveis sem cruzar o **piso** (ex.: jantar teria que ir abaixo do mínimo), **When** o paciente a escolhe, **Then** o sistema **recusa** o rebalanceamento e **orienta** ("hoje ficou acima, segue leve e volta amanhã"), sem aplicar nenhum corte abaixo do piso.
6. **Given** as refeições seguintes não têm nenhum item flexível (só travados / sem grupo), **When** uma opção desigual é escolhida, **Then** o motor não tem alavanca para rebalancear e responde com recusa orientada (não aplica troca silenciosa nem corta item travado).
7. **Given** o nível de exposição do paciente é "oculto", **When** a prévia é exibida, **Then** o sistema mostra a **ação** (as novas quantidades / medidas caseiras das refeições seguintes) **sem** números nutricionais e **sem** "bucket de calorias em %".

---

### User Story 2 - Combinar um alimento em dois (Priority: P2)

Num item flexível, em vez de uma troca 1→1, o paciente quer comer **dois** alimentos no lugar de um (ex.: o plano manda macarrão, ele quer arroz **e** batata). O sistema calcula os gramas de cada um dos dois alvos para que a **dupla** entregue o **mesmo nutriente-base do grupo** que o item original entregava, começando num split **50/50** que o paciente pode ajustar ("mais arroz, menos batata"). Cada quantidade vem com a **medida caseira** mais próxima.

**Why this priority**: Estende a alça de substituição (a prova da Fase 1) para o caso real de "quero variar dentro da mesma refeição", sem conta de cabeça. Depende do conceito de equivalência já existente; é mais simples que o rebalanceamento multi-refeição e **não** o dispara (vive dentro da refeição).

**Independent Test**: Com um item flexível pertencente a um grupo com ≥2 outros alimentos elegíveis, pedir a combinação em dois alvos do mesmo grupo e confirmar que os gramas calculados de cada alvo, somados, preservam o nutriente-base do item original (dentro da tolerância), que o split default é 50/50, que ajustar a proporção recalcula ambos, e que cada um traz sua medida caseira.

**Acceptance Scenarios**:

1. **Given** um item flexível de um grupo e dois alimentos-alvo do **mesmo** grupo, **When** o paciente pede para combinar, **Then** o sistema calcula os gramas de cada alvo de forma que a soma dos nutrientes-base dos dois preserve o nutriente-base do item original (dentro da tolerância), com split inicial **50/50**.
2. **Given** uma combinação calculada em 50/50, **When** o paciente ajusta a proporção (ex.: 70/30), **Then** o sistema recalcula os gramas dos dois alvos preservando o mesmo nutriente-base total.
3. **Given** cada alvo da combinação, **When** os gramas são apresentados, **Then** cada um vem com a medida caseira mais próxima; quando o alvo não tem medida caseira, é exibido em gramas.
4. **Given** um dos alvos tem o nutriente-base do grupo igual a zero, **When** a combinação é montada, **Then** esse alvo é **excluído** como destino válido (recusa do cálculo, sem travar o app).
5. **Given** um item **travado** ou um item **sem grupo**, **When** o paciente o toca, **Then** o sistema **não** oferece combinação.

---

### User Story 3 - App do paciente consome o motor (Priority: P3)

O app do paciente (cliente fino) consome o motor: na tela do dia, o paciente vê as **outras opções** de cada refeição além da default, dispara a escolha e a **prévia**, aplica a **combinação**, e **troca o tipo-de-dia** num toque no próprio rótulo anunciado ("Hoje: dia de treino"). No v0, **trocar o tipo-de-dia exibe o novo cardápio e re-ancora "o agora"** — não rebalanceia no app (ver Assumptions: depende do registro, fora de escopo).

**Why this priority**: É a camada que põe o motor na mão do paciente. Vem depois porque depende de US1/US2 estarem corretos; o app é um cliente fino do cálculo já provado. Mantém a assinatura "mostra o certo por padrão, deixa trocar num toque, nunca barra".

**Independent Test**: Com o motor e o contrato prontos (US1/US2) e um plano semeado, abrir o app, ver as outras opções de uma refeição, escolher uma, ver a prévia, confirmar; combinar um item em dois e ver a refeição atualizar; trocar o tipo-de-dia e confirmar que o app passa a exibir o novo cardápio com "o agora" re-ancorado — tudo respeitando o gate de exposição.

**Acceptance Scenarios**:

1. **Given** uma refeição com mais de uma opção, **When** a tela do dia é exibida, **Then** o app permite ver e escolher as **outras opções** além da default (não só sinalizar que existem).
2. **Given** o paciente escolheu uma opção desigual, **When** a prévia volta do motor, **Then** o app mostra a consequência nas refeições seguintes **antes** de confirmar, e só aplica após a confirmação.
3. **Given** o paciente quer combinar um item flexível em dois, **When** ele monta a combinação, **Then** o app mostra os dois alvos com gramas + medida caseira e permite ajustar a proporção, atualizando a refeição ao confirmar (estado local).
4. **Given** o rótulo de tipo-de-dia anunciado, **When** o paciente toca para trocar o tipo-de-dia, **Then** o app passa a exibir o cardápio do novo tipo-de-dia e re-ancora "o agora" na primeira refeição dele — **sem** rebalancear no v0.
5. **Given** o nível de exposição do paciente, **When** qualquer prévia/refeição é exibida, **Then** os números nutricionais respeitam o nível autorizado (oculto / % / macros / kcal cheio) e nunca aparece "bucket de calorias em %".

---

### Edge Cases

- **Cabe na faixa**: a opção escolhida desvia pouco e o total do dia continua dentro da faixa-alvo → o motor **não** mexe nas refeições seguintes; apenas confirma a troca.
- **Estoura o piso**: o desvio é grande e não há folga suficiente nas alavancas sem cruzar o piso → **recusa orientada**, nunca um corte abaixo do mínimo.
- **Sem alavanca**: as refeições seguintes só têm itens travados ou sem grupo → não há o que ajustar → recusa orientada (não toca em item travado).
- **Sem refeições seguintes**: o gatilho ocorre na última refeição do dia (não há position maior) → não há onde espalhar; se o desvio cabe na faixa, confirma; se não, recusa orienta.
- **Combinação com alvo de nutriente-base zero**: o alvo é excluído da combinação (não pode ser destino de equivalência).
- **Combinação fora do grupo**: alvo de grupo diferente do item original é rejeitado (guarda de domínio; não deve ser alcançável pela UI).
- **Troca de tipo-de-dia no início do dia** (nada consumido): só exibe o novo cardápio; não há passado para descontar, então não há rebalanceamento mesmo quando o registro existir.
- **Troca de tipo-de-dia no v0**: sempre apenas exibe o novo cardápio + re-ancora "o agora" — o rebalanceamento na troca depende do registro (fora de escopo) e fica dormente, ainda que a regra exista e seja testada no motor.
- **Exposição "oculto"**: toda prévia e todo resultado mostram **ação** (quantidades/medidas caseiras), nunca números nutricionais nem percentuais de caloria.
- **Faixa-alvo, não teto**: comer de menos também é fora de adesão — o motor trata desvio para baixo igual ao desvio para cima (puxa de volta para dentro da faixa nos dois sentidos).
- **Conflito entre macros**: quando não dá para acertar todos os macros ao mesmo tempo, o motor prioriza casar as **kcal** do dia e aproxima o resto (FR-010).
- **Parâmetros por nível**: faixa e piso usam o valor **personalizado do paciente**; na ausência, o **default da nutri**; na ausência, o **default sugerido do sistema** (FR-012a). No v0, os níveis nutri/paciente vêm semeados.

## Requirements _(mandatory)_

### Functional Requirements

#### O motor e o alvo do dia

- **FR-001**: O sistema MUST derivar o **alvo nutricional do dia** a partir do somatório dos nutrientes das **opções default** de todas as refeições do tipo-de-dia corrente (o "dia planejado" é o alvo). Não há alvo explícito definido pela nutri nesta feature.
- **FR-002**: O sistema MUST tratar o alvo como uma **faixa por nutriente** (alvo ± tolerância), não como teto. Um desvio que mantenha o total do dia **dentro** da faixa NÃO exige rebalanceamento.
- **FR-003**: O sistema MUST tratar desvio **para baixo** (comer de menos) como tão fora de adesão quanto desvio para cima — o rebalanceamento puxa o total de volta para dentro da faixa nos dois sentidos.
- **FR-004**: O cálculo do motor MUST ser determinístico e **nunca** travar/lançar diante de entrada inválida ou de desvio que não cabe — ele retorna ou um resultado (prévia) ou uma **recusa orientada** tipada.

#### Gatilho P1 — escolher outra opção (rebalanceamento multi-macro)

- **FR-005**: Quando o paciente escolhe uma **opção diferente da default** de uma refeição, o sistema MUST recalcular **todos os macros** do dia e, se o total sair da faixa, espalhar a diferença ajustando as **quantidades dos itens flexíveis** das refeições **seguintes** (position maior que a refeição do gatilho, no mesmo tipo-de-dia).
- **FR-006**: O rebalanceamento MUST NOT alterar itens **travados** nem itens **sem grupo de substituição** — só itens flexíveis são alavancas.
- **FR-007**: O sistema MUST apresentar a **prévia** (o estado recalculado das refeições seguintes) **antes** de o paciente confirmar; nada é aplicado silenciosamente.
- **FR-008**: O sistema MUST aplicar o rebalanceamento somente após **confirmação** do paciente; ao desistir, o dia volta ao estado anterior à escolha.
- **FR-009**: Quando o desvio **não couber** nas alavancas disponíveis sem cruzar o **piso**, o sistema MUST **recusar** o rebalanceamento e **orientar** o paciente (mensagem de normalização, ex.: "hoje ficou acima, segue leve e volta amanhã"), sem aplicar nenhum corte abaixo do piso.
- **FR-010**: Quando os macros não puderem todos ser trazidos exatamente à faixa ao mesmo tempo (sistema sobredeterminado), o sistema MUST fazer o melhor esforço de aproximação respeitando o piso, em vez de falhar. A **prioridade é casar as kcal** (energia do dia) quando há conflito entre macros; a ponderação fina dos demais nutrientes (carb/proteína/gordura) depois das kcal é decisão do plano técnico.

#### Piso inviolável

- **FR-011**: O sistema MUST respeitar um **piso** por item flexível (quantidade mínima) que o rebalanceamento **nunca** cruza, de modo a jamais mandar o paciente passar fome para compensar.
- **FR-012**: O piso MUST ser um **percentual mínimo da quantidade planejada** de cada item flexível, configurável (parâmetro ajustável), e não um valor cravado no código de regra.

#### Parametrização da adaptação (faixa-alvo e piso) — 3 níveis

- **FR-012a**: A **largura da faixa-alvo** (tolerância por nutriente — FR-002) e o **percentual do piso** (FR-012) MUST ser resolvidos por **precedência de três níveis**, do mais específico para o mais genérico: (1) **personalizado para o paciente** (vence), (2) **default da nutri**, (3) **default sugerido pelo sistema** (fallback). O valor efetivo é o do nível mais específico que estiver definido.
- **FR-012b**: O sistema MUST prover **defaults sugeridos** (nível 3, fallback) para os dois parâmetros, usados quando nem a nutri nem o paciente definiram valor.
- **FR-012c**: No **v0**, os valores de nível **nutri** e de nível **paciente** MUST ser semeados (a UI da nutri para editá-los está fora de escopo); a **resolução** de qual valor vale é determinística e independente de I/O. Isto é **configuração**, distinta do estado de escolha efêmero (FR-026).

#### Gatilho P2 — combinação (1→2)

- **FR-013**: Para um item flexível, o sistema MUST permitir **combinar** o item em **dois** alimentos-alvo (somente 1→2 nesta feature), calculando os gramas de cada alvo de forma que a dupla **preserve o nutriente-base do grupo** do item original (dentro da tolerância).
- **FR-014**: Os dois alvos da combinação MUST pertencer ao **mesmo grupo de substituição** do item original; alvo de outro grupo é rejeitado.
- **FR-015**: A combinação MUST iniciar num split **50/50** do nutriente-base entre os dois alvos e permitir que o paciente **ajuste a proporção**, recalculando ambos os gramas preservando o nutriente-base total.
- **FR-016**: O sistema MUST arredondar cada quantidade da combinação para a **medida caseira** mais próxima do alvo; quando o alvo não tiver medida caseira, exibir em gramas.
- **FR-017**: O sistema MUST **excluir** da combinação qualquer alvo cujo nutriente-base do grupo seja **zero** (não pode ser destino de equivalência).
- **FR-018**: A combinação MUST NOT disparar rebalanceamento multi-refeição (preserva um nutriente, vive dentro da refeição).
- **FR-019**: O sistema MUST NOT oferecer combinação para item **travado** nem para item **sem grupo**.

#### Gatilho P3 — troca de tipo-de-dia

- **FR-020**: O motor MUST suportar a regra de **troca de tipo-de-dia no total do dia**: dado o que já foi consumido até o momento da troca e o **alvo do novo tipo-de-dia**, redistribuir o que falta nas refeições restantes do novo cardápio (não slot-a-slot), respeitando o piso — ou **recusar e orientar** quando o consumido já estoura o novo alvo. Esta regra é implementada e testada no nível do motor.
- **FR-021**: No app **v0**, trocar o tipo-de-dia MUST apenas **exibir o novo cardápio** e **re-ancorar "o agora"** na primeira refeição do novo tipo-de-dia, **sem** rebalancear — porque "o que já foi consumido" depende do registro (fora de escopo). O rebalanceamento na troca passa a valer quando o registro existir.
- **FR-022**: O sistema MUST NOT inventar/assumir consumo no v0 para forçar o rebalanceamento na troca de tipo-de-dia.

#### Transversais

- **FR-023**: O sistema MUST entregar **ação concreta** (ex.: "jantar: arroz 3 colheres em vez de 4"), não número de culpa; MUST NOT exibir "bucket de calorias em %".
- **FR-024**: Os números nutricionais exibidos (em prévias, opções e combinações) MUST respeitar o **nível de exposição** configurado para o paciente (oculto / % / macros / kcal cheio).
- **FR-025**: O sistema MUST permitir que o paciente veja e escolha as **outras opções** de cada refeição (além da default), habilitando o gatilho P1.
- **FR-026**: As **escolhas** desta feature (opção, combinação, troca de tipo-de-dia) MUST ser aplicadas apenas em **estado local** (efêmero) no v0 — nenhuma escolha é persistida. _(A configuração de faixa/piso por nutri e por paciente — FR-012c — é dado de **config semeado**, não escolha; é a única exceção à regra "sem persistência nova".)_
- **FR-027**: O acesso aos dados de plano e saúde do paciente MUST respeitar controle de acesso (só o próprio paciente e a nutri responsável). _(LGPD — transversal.)_

### Key Entities _(include if feature involves data)_

- **Opção de refeição**: uma das variações pré-montadas de uma refeição (os "3 almoços"); uma é a default. As opções podem ter perfis nutricionais diferentes — escolher uma não-default é o gatilho P1.
- **Item flexível / travado**: item de uma opção; **flexível** (não travado, com grupo) é uma **alavanca** do rebalanceamento; **travado** ou **sem grupo** nunca é tocado pelo motor.
- **Tipo-de-dia**: o cardápio do dia inteiro (treino / leve / descanso). Trocá-lo é o gatilho P3 (camada grossa).
- **Alvo do dia**: somatório dos nutrientes das opções default de todas as refeições do tipo-de-dia corrente. Derivado, não armazenado.
- **Faixa-alvo**: o alvo ± uma tolerância por nutriente; define o que conta como "dentro" (sem ação) vs "fora" (rebalanceia ou recusa).
- **Parâmetros de adaptação** (faixa-alvo e piso): valores que governam o motor, resolvidos por **precedência de 3 níveis** — personalizado-paciente > default-nutri > default-sugerido-sistema. Configuração (semeada no v0), distinta do estado de escolha efêmero.
- **Piso**: quantidade mínima de um item flexível (percentual da quantidade planejada) que o motor nunca cruza.
- **Prévia de rebalanceamento**: o estado recalculado das refeições seguintes, mostrado antes da confirmação — ou uma recusa orientada quando o desvio não cabe.
- **Combinação**: a decomposição de um item flexível em dois alvos do mesmo grupo, com um split ajustável que preserva o nutriente-base.
- **Consumo-até-agora** _(conceitual, alimenta o motor de troca de tipo-de-dia; fonte de dados — o registro — fora de escopo no v0)_.
- **Nível de exposição**: gate, controlado pela nutri, de quanto número nutricional o paciente vê.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Em **100%** das escolhas de opção desigual que exigem ajuste, o paciente vê a **prévia** das refeições seguintes **antes** de qualquer aplicação — o sistema **nunca** aplica rebalanceamento sem confirmação.
- **SC-002**: Em **0** casos o rebalanceamento reduz um item flexível **abaixo do piso** configurado; quando o desvio não cabe, o resultado é sempre uma recusa orientada.
- **SC-003**: O motor **nunca** altera item travado ou item sem grupo — em **100%** dos rebalanceamentos, as alavancas movidas são exclusivamente itens flexíveis.
- **SC-004**: Quando a opção escolhida mantém o total do dia **dentro da faixa-alvo**, o sistema **não** altera nenhuma refeição seguinte (rebalanceamento desnecessário em **0** desses casos).
- **SC-005**: Na combinação, a soma dos nutrientes-base dos dois alvos preserva o nutriente-base do item original dentro de **≤ 2%**.
- **SC-006**: Em **0** telas/respostas aparece "bucket de calorias em %"; e em **100%** dos casos com exposição "oculto", a prévia é exibida como ação (quantidades/medidas) sem números nutricionais.
- **SC-007**: O paciente conclui "escolher outra opção e ver a prévia" em **no máximo 2 toques** (1 para abrir as opções, 1 para escolher) e vê a consequência imediatamente.
- **SC-008**: No app v0, trocar o tipo-de-dia rebalanceia em **0** casos (apenas exibe o novo cardápio + re-ancora "o agora"); a regra de rebalanceamento por total-do-dia é coberta por testes no nível do motor.
- **SC-009**: Os parâmetros efetivos (faixa-alvo e piso) resolvem por **precedência** em **100%** dos cálculos: personalização do paciente vence o default da nutri, que vence o default sugerido do sistema; na ausência de qualquer override, vale o default sugerido.
- **SC-010**: Em conflito entre macros, o resultado do motor casa as **kcal** do dia dentro da faixa em **100%** dos casos em que isso é fisicamente possível respeitando o piso.

## Assumptions

- **Alvo derivado das defaults**: o alvo do dia é o somatório das opções default; alvo explícito definido pela nutri é uma ideia futura (registrada no backlog), fora desta feature.
- **Tolerância da faixa-alvo**: default **sugerido pelo sistema = ±10% por nutriente** (nível 3); sobrescrevível por default-da-nutri (nível 2) e por personalização-do-paciente (nível 1), conforme FR-012a.
- **Piso**: default **sugerido pelo sistema = 50%** da quantidade planejada por item flexível (nível 3); sobrescrevível por nutri e por paciente (FR-012a).
- **Onde os overrides vivem no v0**: os valores de nível nutri e paciente são **semeados** (config), já que a UI da nutri está fora de escopo. Isso implica um **pequeno acréscimo de schema** (campos de configuração em entidades existentes — provável `nutritionist` e `patient`); a modelagem exata é decisão do data-model no `/speckit-plan`. Não confundir com persistir escolhas (que segue efêmero — FR-026).
- **Tolerância de equivalência da combinação**: ≤ 2% sobre o nutriente-base (mesma régua da substituição da Fase 1).
- **Melhor esforço multi-macro**: quando não dá para zerar todos os macros ao mesmo tempo, o motor minimiza o desvio respeitando o piso e **prioriza casar as kcal** (FR-010); a ponderação fina dos demais macros é decisão do plano técnico.
- **"Refeições seguintes"**: definidas por `position` maior que a refeição do gatilho, no mesmo tipo-de-dia (sem registro, é o critério disponível).
- **Registro fora de escopo**: feito/troquei/pulei e o avanço de "o agora" por consumo continuam diferidos; por isso a troca de tipo-de-dia no app v0 não rebalanceia.
- **Persistência fora de escopo**: tudo é estado local/efêmero no v0, como a substituição da Fase 1; sem tabelas novas.
- **Auth stub (v0)**: paciente fixo por configuração de ambiente; autenticação de verdade fora de escopo.
- **Plano semeado**: dados (paciente, plano, tipos-de-dia, refeições, opções desiguais, itens flexíveis, grupos) são semeados direto no banco; a UI da nutri está fora de escopo.
- **Camadas de entrega**: o motor (cálculo) e o contrato que o expõe são provados primeiro (testáveis sem a tela); o app do paciente é o cliente fino que vem em seguida (US3), espelhando a sequência da Fase 1.

## Out of Scope _(desta feature)_

- Registro/log real (feito/troquei/pulei) e o avanço de "o agora" por consumo. **Nota:** o rebalanceamento na troca de tipo-de-dia depende deste registro; por isso a troca fica "só exibe o novo cardápio" no app v0.
- Persistência das escolhas (opção/combinação/troca de tipo-de-dia) e qualquer estrutura nova de persistência (seleção-de-dia, eventos de refeição).
- Alvo nutricional explícito definido pela nutri (registrado como ideia de backlog).
- Rebalanceamento multi-macro em **troca de item dentro da refeição** (item swap e combinação permanecem single-nutriente).
- **Motor escolher/trocar alimentos do cardápio para rebalancear** (em vez de só reescalar quantidades). O rebalanceamento no v0 é **cálculo fechado e determinístico** que reescala as quantidades dos itens flexíveis das refeições seguintes; deixar o motor escolher outros alimentos (troca dentro do grupo como alavanca, ou busca cruzando grupos) é **improvement futuro** (backlog).
- Combinação 1→3 ou mais (somente 1→2 nesta feature).
- UI da nutri (web), import de plano por IA, registro de comida fora da lista.
- Autenticação de verdade, offline robusto, notificações.
- Índices/constraints de performance.
