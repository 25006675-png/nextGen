The concept

An inventory-and-waste platform for F&B SMEs that predicts what they'll waste before they buy it, and sends unavoidable expired stock to BSF partners.

Target users: small F&B businesses such as kopitiams, cafés, caterers, bakeries and mini-markets. They buy raw ingredients often, but don't track inventory properly.

1. Data inputs

Waste log (the main input):

What was thrown away: item, quantity, cost
The reason, chosen from expired, spoiled, over-bought or trimmings
Logging should take under 10 seconds: a photo plus a few taps, or a smart scale

Food data (what feeds the predictions):

Purchases: what was bought, how much, when, and the expiry date
Sales or usage: from POS data, or a simple "sold today" entry
Context: day of the week, public holidays, Ramadan or festive periods, school holidays, weather
2. Predictive modelling
Model	What it predicts	What the SME sees
Demand forecast	How much of each ingredient will be used next week	"Order 8 kg chicken, not 10 kg"
Expiry risk	Which items will likely expire before they're used	"Use the tomatoes first: 70% risk of expiring by Friday"
Waste forecast	Expected waste in RM and kg if they keep buying the same way	"You'll waste ~RM120 this week at your current orders"

For the hackathon, keep the models simple:

Start with a day-of-week moving average or linear regression.
Mention that you'd upgrade to time-series models like Prophet as more data comes in.
Demo with realistic mock data, for example 3 months of a kopitiam's purchases and waste.

Judges care more that the prediction leads to a clear action than about the model's complexity.

3. Outputs on the dashboard
Money first: "RM lost this month: RM640" is the number SMEs care about.
Smart order list: the recommended quantity for each item on the next order.
Use-first alerts: items close to expiry, with suggestions like "turn it into today's special".
Top wasted items: a ranking showing where the money leaks.
ESG report: kg diverted from landfill and CO₂ avoided each month, ready to share with customers or banks.
4. The BSF loop
Automatic tagging: waste logged as expired raw items, spoiled produce or trimmings is tagged BSF-eligible.
Pickup scheduling: once enough has built up, the app books a pickup with a partner BSF farm.
Traceability: each batch has a record of where it came from, what it is and when it was collected, which gives regulators the traceability the Feed Act cares about.
Return loop: the SME can get frass fertiliser back for their garden or herbs, or receive a small credit.
5. Revenue
A monthly subscription for the dashboard and predictions. The pitch is that it pays for itself in waste saved.
A collection fee for BSF-eligible waste, set cheaper than landfill or private disposal.
A partner share from BSF farms that get a steady supply of clean feedstock.
Later, aggregated anonymous data sold to suppliers or for ESG reporting.
6. What to build today (MVP)
Log waste screen: item, quantity, reason, photo.
Dashboard: RM lost, top wasted items, and a forecast chart.
Smart order list: predicted quantities next to what they usually buy.
BSF pickup screen: eligible waste collected so far and a "Schedule pickup" button.
ESG summary card: kg diverted and CO₂ saved.