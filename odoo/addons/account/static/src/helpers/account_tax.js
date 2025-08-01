import { floatIsZero, roundPrecision } from "@web/core/utils/numbers";
import { _t } from "@web/core/l10n/translation";

export const accountTaxHelpers = {
    // -------------------------------------------------------------------------
    // HELPERS IN BOTH PYTHON/JAVASCRIPT (account_tax.js / account_tax.py)

    // PREPARE TAXES COMPUTATION
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_taxes_computation_prepare_product_values(default_product_values, product) {
        const product_values = {};
        for (const [field_name, field_info] of Object.entries(default_product_values)) {
            product_values[field_name] = product
                ? product[field_name] || field_info.default_value
                : field_info.default_value;
        }
        return product_values;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
     flatten_taxes_and_sort_them(taxes) {
         function sort_key(taxes) {
             return taxes.toSorted((t1, t2) => t1.sequence - t2.sequence || t1.id - t2.id);
         }

         const group_per_tax = {};
         const sorted_taxes = [];
         for (const tax of sort_key(taxes)) {
             if (tax.amount_type === "group") {
                 const children = sort_key(tax.children_tax_ids);
                 for (const child of children) {
                     group_per_tax[child.id] = tax;
                     sorted_taxes.push(child);
                 }
             } else {
                 sorted_taxes.push(tax);
             }
         }
         return { sorted_taxes, group_per_tax };
     },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    batch_for_taxes_computation(taxes, { special_mode = null, filter_tax_function = null } = {}) {
        let { sorted_taxes, group_per_tax } = this.flatten_taxes_and_sort_them(taxes);
        if (filter_tax_function) {
            sorted_taxes = sorted_taxes.filter(filter_tax_function);
        }

        const results = {
            batch_per_tax: {},
            group_per_tax: group_per_tax,
            sorted_taxes: sorted_taxes,
        };

        // Group them per batch.
        let batch = [];
        let is_base_affected = false;
        for (const tax of results.sorted_taxes.toReversed()) {
            if (batch.length > 0) {
                const same_batch =
                    tax.amount_type === batch[0].amount_type &&
                    (special_mode || tax.price_include === batch[0].price_include) &&
                    tax.include_base_amount === batch[0].include_base_amount &&
                    ((tax.include_base_amount && !is_base_affected) || !tax.include_base_amount);
                if (!same_batch) {
                    for (const batch_tax of batch) {
                        results.batch_per_tax[batch_tax.id] = batch;
                    }
                    batch = [];
                }
            }

            is_base_affected = tax.is_base_affected;
            batch.push(tax);
        }

        if (batch.length !== 0) {
            for (const batch_tax of batch) {
                results.batch_per_tax[batch_tax.id] = batch;
            }
        }
        return results;
    },

    propagate_extra_taxes_base(taxes, tax, taxes_data, { special_mode = null } = {}) {
        function* get_tax_before() {
            for (const tax_before of taxes) {
                if (taxes_data[tax.id].batch.includes(tax_before)) {
                    break;
                }
                yield tax_before;
            }
        }

        function* get_tax_after() {
            for (const tax_after of taxes.toReversed()) {
                if (taxes_data[tax.id].batch.includes(tax_after)) {
                    break;
                }
                yield tax_after;
            }
        }

        function add_extra_base(other_tax, sign) {
            const tax_amount = taxes_data[tax.id].tax_amount;
            if (!("tax_amount" in taxes_data[other_tax.id])) {
                taxes_data[other_tax.id].extra_base_for_tax += sign * tax_amount;
            }
            taxes_data[other_tax.id].extra_base_for_base += sign * tax_amount;
        }

        if (tax.price_include) {
            // Case: special mode is False or 'total_included'
            if (!special_mode || special_mode === "total_included") {
                if (tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        if (!other_tax.is_base_affected) {
                            add_extra_base(other_tax, -1)
                        }
                    }
                } else {
                    for (const other_tax of get_tax_after()) {
                        add_extra_base(other_tax, -1)
                    }
                }
                for (const other_tax of get_tax_before()) {
                    add_extra_base(other_tax, -1);
                }

            // Case: special_mode = 'total_excluded'
            } else {
                if (tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        if (other_tax.is_base_affected) {
                            add_extra_base(other_tax, 1);
                        }
                    }
                }
            }

        } else if (!tax.price_include) {
            // Case: special_mode is False or 'total_excluded'
            if (!special_mode || special_mode === "total_excluded") {
                if (tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        if (other_tax.is_base_affected) {
                            add_extra_base(other_tax, 1);
                        }
                    }
                }

            // Case: special_mode = 'total_included'
            } else {
                if (!tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        add_extra_base(other_tax, -1);
                    }
                }
                for (const other_tax of get_tax_before()) {
                    add_extra_base(other_tax, -1);
                }
            }
        }
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_fixed_amount(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === "fixed") {
            return evaluation_context.quantity * tax.amount;
        }
        return null;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_price_included(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === "percent") {
            const total_percentage =
                batch.reduce(
                    (sum, batch_tax) => sum + batch_tax.amount,
                    0
                ) / 100.0;
            const to_price_excluded_factor =
                total_percentage !== -1 ? 1 / (1 + total_percentage) : 0.0;
            return (raw_base * to_price_excluded_factor * tax.amount) / 100.0;
        }

        if (tax.amount_type === "division") {
            return (raw_base * tax.amount) / 100.0;
        }
        return null;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_price_excluded(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === "percent") {
            return (raw_base * tax.amount) / 100.0;
        }

        if (tax.amount_type === "division") {
            const total_percentage =
                batch.reduce(
                    (sum, batch_tax) => sum + batch_tax.amount,
                    0
                ) / 100.0;
            const incl_base_multiplicator = total_percentage === 1.0 ? 1.0 : 1 - total_percentage;
            return (raw_base * tax.amount) / 100.0 / incl_base_multiplicator;
        }
        return null;
    },

    get_tax_details(
        taxes,
        price_unit,
        quantity,
        {
            precision_rounding = null,
            rounding_method = "round_per_line",
            // When product is null, we need the product default values to make the "formula" taxes
            // working. In that case, we need to deal with the product default values before calling this
            // method because we have no way to deal with it automatically in this method since it depends of
            // the type of involved fields and we don't have access to this information js-side.
            product = null,
            special_mode = null,
            manual_tax_amounts = null, // TO BE REMOVED IN MASTER
            filter_tax_function = null,
        } = {}
    ) {
        const self = this;

        function add_tax_amount_to_results(tax, tax_amount) {
            taxes_data[tax.id].tax_amount = tax_amount;
            if (rounding_method === "round_per_line") {
                taxes_data[tax.id].tax_amount = roundPrecision(
                    taxes_data[tax.id].tax_amount,
                    precision_rounding
                );
            }
            if (tax.has_negative_factor){
                reverse_charge_taxes_data[tax.id].tax_amount = -taxes_data[tax.id].tax_amount;
            }

            self.propagate_extra_taxes_base(sorted_taxes, tax, taxes_data, {
                special_mode: special_mode,
            });
        }

        function eval_tax_amount(tax_amount_function, tax) {
            const is_already_computed = "tax_amount" in taxes_data[tax.id];
            if (is_already_computed) {
                return;
            }

            const tax_amount = tax_amount_function(
                tax,
                taxes_data[tax.id].batch,
                raw_base + taxes_data[tax.id].extra_base_for_tax,
                evaluation_context
            );
            if (tax_amount !== null) {
                add_tax_amount_to_results(tax, tax_amount);
            }
        }

        // Flatten the taxes, order them and filter them if necessary.

        function prepare_tax_extra_data(tax, kwargs = {}) {
            let price_include;
            if (special_mode === "total_included") {
                price_include = true;
            } else if (special_mode === "total_excluded") {
                price_include = false;
            } else {
                price_include = tax.price_include;
            }
            return {
                ...kwargs,
                tax: tax,
                price_include: price_include,
                extra_base_for_tax: 0.0,
                extra_base_for_base: 0.0,
            };
        }

        const batching_results = this.batch_for_taxes_computation(taxes, {
            special_mode: special_mode,
            filter_tax_function: filter_tax_function,
        });
        let sorted_taxes = batching_results.sorted_taxes;
        const taxes_data = {};
        const reverse_charge_taxes_data = {};
        for (const tax of sorted_taxes) {
            taxes_data[tax.id] = prepare_tax_extra_data(tax, {
                group: batching_results.group_per_tax[tax.id],
                batch: batching_results.batch_per_tax[tax.id],
            });
            if (tax.has_negative_factor) {
                reverse_charge_taxes_data[tax.id] = {
                    ...taxes_data[tax.id],
                    is_reverse_charge: true,
                }
            }
        }

        let raw_base = quantity * price_unit;
        if (rounding_method === "round_per_line") {
            raw_base = roundPrecision(raw_base, precision_rounding);
        }

        let evaluation_context = {
            product: product || {},
            price_unit: price_unit,
            quantity: quantity,
            raw_base: raw_base,
            special_mode: special_mode,
        };

        // Define the order in which the taxes must be evaluated.
        // Fixed taxes are computed directly because they could affect the base of a price included batch right after.
        for (const tax of sorted_taxes.toReversed()) {
            eval_tax_amount(this.eval_tax_amount_fixed_amount.bind(this), tax);
        }

        // Then, let's travel the batches in the reverse order and process the price-included taxes.
        for (const tax of sorted_taxes.toReversed()) {
            if (taxes_data[tax.id].price_include) {
                eval_tax_amount(this.eval_tax_amount_price_included.bind(this), tax);
            }
        }

        // Then, let's travel the batches in the normal order and process the price-excluded taxes.
        for (const tax of sorted_taxes) {
            if (!taxes_data[tax.id].price_include) {
                eval_tax_amount(this.eval_tax_amount_price_excluded.bind(this), tax);
            }
        }

        // Mark the base to be computed in the descending order. The order doesn't matter for no special mode or 'total_excluded' but
        // it must be in the reverse order when special_mode is 'total_included'.
        for (const tax of sorted_taxes.toReversed()) {
            const tax_data = taxes_data[tax.id];
            if (!("tax_amount" in tax_data)) {
                continue;
            }

            // Base amount.
            const total_tax_amount = taxes_data[tax.id].batch.reduce(
                (sum, other_tax) => sum + taxes_data[other_tax.id].tax_amount,
                0
            ) +
            Object.values(taxes_data[tax.id].batch)
                .filter(other_tax => other_tax.has_negative_factor)
                .reduce((sum, other_tax) => sum + reverse_charge_taxes_data[other_tax.id].tax_amount, 0);
            let base = raw_base + taxes_data[tax.id].extra_base_for_base;
            if (tax_data.price_include && (!special_mode || special_mode === "total_included")) {
                base -= total_tax_amount;
            }
            tax_data.base = base;

            // Reverse charge.
            if (tax.has_negative_factor) {
                const reverse_charge_tax_data = reverse_charge_taxes_data[tax.id];
                reverse_charge_tax_data.base = base;
            }
        }

        const taxes_data_list = [];
        for (const tax of sorted_taxes) {
            const tax_data = taxes_data[tax.id];
            if ("tax_amount" in tax_data){
                taxes_data_list.push(tax_data);
                if (tax.has_negative_factor) {
                    taxes_data_list.push(reverse_charge_taxes_data[tax.id]);
                }
            }
        }

        let total_excluded, total_included;
        if (taxes_data_list.length > 0) {
            total_excluded = taxes_data_list[0].base;
            const tax_amount = taxes_data_list.reduce(
                (sum, tax_data) => sum + tax_data.tax_amount,
                0
            );
            total_included = total_excluded + tax_amount;
        } else {
            total_excluded = total_included = raw_base;
        }

        return {
            total_excluded: total_excluded,
            total_included: total_included,
            taxes_data: taxes_data_list.map(tax_data => Object.assign({}, {
                tax: tax_data.tax,
                group: batching_results.group_per_tax[tax_data.tax.id],
                batch: batching_results.batch_per_tax[tax_data.tax.id],
                tax_amount: tax_data.tax_amount,
                base_amount: tax_data.base,
                is_reverse_charge: tax_data.is_reverse_charge || false
            })),
        };
    },

    // -------------------------------------------------------------------------
    // MAPPING PRICE_UNIT
    // -------------------------------------------------------------------------

    adapt_price_unit_to_another_taxes(price_unit, product, original_taxes, new_taxes) {
        const original_tax_ids = new Set(original_taxes.map((x) => x.id));
        const new_tax_ids = new Set(new_taxes.map((x) => x.id));
        if (
            (original_tax_ids.size === new_tax_ids.size &&
                [...original_tax_ids].every((value) => new_tax_ids.has(value))) ||
            original_taxes.some((x) => !x.price_include)
        ) {
            return price_unit;
        }

        // Find the price unit without tax.
        let taxes_computation = this.get_tax_details(original_taxes, price_unit, 1.0, {
            rounding_method: "round_globally",
            product: product,
        });
        price_unit = taxes_computation.total_excluded;

        // Find the new price unit after applying the price included taxes.
        taxes_computation = this.get_tax_details(new_taxes, price_unit, 1.0, {
            rounding_method: "round_globally",
            product: product,
            special_mode: "total_excluded",
        });
        let delta = 0.0;
        for (const tax_data of taxes_computation.taxes_data) {
            if (tax_data.tax.price_include) {
                delta += tax_data.tax_amount;
            }
        }
        return price_unit + delta;
    },

    // -------------------------------------------------------------------------
    // GENERIC REPRESENTATION OF BUSINESS OBJECTS & METHODS
    // -------------------------------------------------------------------------

    get_base_line_field_value_from_record(record, field, extra_values, fallback) {
        if (field in extra_values) {
            return extra_values[field] || fallback;
        }
        if (record && field in record) {
            return record[field] || fallback;
        }
        return fallback;
    },

    prepare_base_line_for_taxes_computation(record, kwargs = {}){
        const load = (field, fallback) => this.get_base_line_field_value_from_record(record, field, kwargs, fallback);

        const currency = (
            load('currency_id', null)
            || load('company_currency_id', null)
            || load('company_id', {}).currency_id
            || {}
        )

        return {
            ...kwargs,
            record: record,
            id: load('id', 0),
            product_id: load('product_id', {}),
            product_uom_id: load('product_uom_id', {}),
            tax_ids: load('tax_ids', {}),
            price_unit: load('price_unit', 0.0),
            quantity: load('quantity', 0.0),
            discount: load('discount', 0.0),
            currency_id: currency,
            sign: load('sign', 1.0),
            special_mode: load('special_mode', null),
            special_type: load('special_type', null),
            rate: load("rate", 1.0),
            manual_tax_amounts: load("manual_tax_amounts", null),
            filter_tax_function: load("filter_tax_function", null),
        }
    },

    add_tax_details_in_base_line(base_line, company, { rounding_method = null } = {}) {
        rounding_method = rounding_method || company.tax_calculation_rounding_method;
        const price_unit_after_discount = base_line.price_unit * (1 - base_line.discount / 100.0);
        const currency_pd = base_line.currency_id.rounding;
        const company_currency_pd = company.currency_id.rounding;
        const taxes_computation = this.get_tax_details(
            base_line.tax_ids,
            price_unit_after_discount,
            base_line.quantity,
            {
                precision_rounding: currency_pd,
                rounding_method: rounding_method,
                product: base_line.product_id,
                special_mode: base_line.special_mode,
                filter_tax_function: base_line.filter_tax_function
            }
        );

        const rate = base_line.rate;
        const tax_details = base_line.tax_details = {
            raw_total_excluded_currency: taxes_computation.total_excluded,
            raw_total_excluded: rate ? taxes_computation.total_excluded / rate : 0.0,
            raw_total_included_currency: taxes_computation.total_included,
            raw_total_included: rate ? taxes_computation.total_included / rate : 0.0,
            taxes_data: []
        };

        if (rounding_method === "round_per_line") {
            tax_details.raw_total_excluded = roundPrecision(tax_details.raw_total_excluded, currency_pd);
            tax_details.raw_total_included = roundPrecision(tax_details.raw_total_included, currency_pd);
        }

        for (const tax_data of taxes_computation.taxes_data) {
            let tax_amount = rate ? tax_data.tax_amount / rate : 0.0;
            let base_amount = rate ? tax_data.base_amount / rate : 0.0;

            if (rounding_method === "round_per_line") {
                tax_amount = roundPrecision(tax_amount, company_currency_pd);
                base_amount = roundPrecision(base_amount, company_currency_pd);
            }

            tax_details.taxes_data.push({
                ...tax_data,
                raw_tax_amount_currency: tax_data.tax_amount,
                raw_tax_amount: tax_amount,
                raw_base_amount_currency: tax_data.base_amount,
                raw_base_amount: base_amount
            });
        }
    },

    add_tax_details_in_base_lines(base_lines, company) {
        for(const base_line of base_lines){
            this.add_tax_details_in_base_line(base_line, company);
        }
    },

    distribute_delta_amount_smoothly(precision_digits, delta_amount, target_factors) {
        const precision_rounding = Number(`1e-${precision_digits}`);
        const amounts_to_distribute = target_factors.map((x) => 0.0);
        if (floatIsZero(delta_amount, precision_digits)) {
            return amounts_to_distribute;
        }

        const sign = delta_amount < 0.0 ? -1 : 1;
        const nb_of_errors = Math.round(Math.abs(delta_amount / precision_rounding));
        let remaining_errors = nb_of_errors;

        for (let i = 0; i < target_factors.length; i++) {
            const factor = target_factors[i].factor;
            if (remaining_errors === 0) {
                break;
            }

            const nb_of_amount_to_distribute = Math.min(
                Math.ceil(Math.abs(factor * nb_of_errors)),
                remaining_errors
            );

            remaining_errors -= nb_of_amount_to_distribute;
            const amount_to_distribute = sign * nb_of_amount_to_distribute * precision_rounding;
            amounts_to_distribute[i] += amount_to_distribute;
        }

        return amounts_to_distribute;
    },

    round_base_lines_tax_details(base_lines, company) {
        const total_per_tax = {};
        const total_per_base = {};
        const country_code = company.account_fiscal_country_id.code;

        for (const base_line of base_lines) {
            const currency = base_line.currency_id;
            const manual_tax_amounts = base_line.manual_tax_amounts;
            const rate = base_line.rate;
            const tax_details = base_line.tax_details;
            tax_details.delta_total_excluded_currency = 0.0;
            tax_details.delta_total_excluded = 0.0;
            tax_details.total_included_currency = roundPrecision(
                tax_details.raw_total_included_currency,
                currency.rounding
            );
            tax_details.total_included = roundPrecision(
                tax_details.raw_total_included,
                company.currency_id.rounding
            );
            const taxes_data = tax_details.taxes_data;

            // If there are taxes on it, account the amounts from taxes_data.
            let index = 0;
            for (const tax_data of taxes_data) {
                const tax = tax_data.tax;
                tax_data.base_amount_currency = roundPrecision(
                    tax_data.raw_base_amount_currency,
                    currency.rounding
                );
                tax_data.base_amount = roundPrecision(
                    tax_data.raw_base_amount,
                    company.currency_id.rounding
                );
                const current_manual_tax_amounts =
                    (manual_tax_amounts || {})[tax.id.toString()] || {};
                let raw_base_amount_currency = null;
                let raw_base_amount = null;
                if ("base_amount_currency" in current_manual_tax_amounts) {
                    raw_base_amount_currency = current_manual_tax_amounts.base_amount_currency;
                    raw_base_amount = rate ? raw_base_amount_currency / rate : 0.0;
                    const base_amount_currency = roundPrecision(
                        raw_base_amount_currency,
                        currency.rounding
                    );
                    const base_amount = roundPrecision(
                        raw_base_amount,
                        company.currency_id.rounding
                    );
                    tax_data.base_amount_currency = base_amount_currency;
                    tax_data.base_amount = base_amount;
                } else {
                    raw_base_amount_currency = tax_data.raw_base_amount_currency;
                    raw_base_amount = tax_data.raw_base_amount;
                }
                if ("base_amount" in current_manual_tax_amounts) {
                    raw_base_amount = current_manual_tax_amounts.base_amount;
                    const base_amount = roundPrecision(
                        raw_base_amount,
                        company.currency_id.rounding
                    );
                    tax_data.base_amount = base_amount;
                }

                if (index === 0) {
                    tax_details.total_excluded_currency = tax_data.base_amount_currency;
                    tax_details.total_excluded = tax_data.base_amount;
                }

                let raw_tax_amount_currency = null;
                let raw_tax_amount = null;
                if ("tax_amount_currency" in current_manual_tax_amounts) {
                    raw_tax_amount_currency = roundPrecision(
                        current_manual_tax_amounts.tax_amount_currency,
                        currency.rounding
                    );
                    raw_tax_amount = rate
                        ? roundPrecision(raw_tax_amount_currency, company.currency_id.rounding) /
                          rate
                        : 0.0;
                } else {
                    raw_tax_amount_currency = tax_data.raw_tax_amount_currency;
                    raw_tax_amount = tax_data.raw_tax_amount;
                }
                if ("tax_amount" in current_manual_tax_amounts) {
                    raw_tax_amount = roundPrecision(
                        current_manual_tax_amounts.tax_amount,
                        company.currency_id.rounding
                    );
                }
                tax_data.tax_amount_currency = roundPrecision(
                    raw_tax_amount_currency,
                    currency.rounding
                );
                tax_data.tax_amount = roundPrecision(raw_tax_amount, company.currency_id.rounding);

                const tax_rounding_key = [tax.id, currency.id, base_line.is_refund, tax_data.is_reverse_charge];
                if (!(tax_rounding_key in total_per_tax)) {
                    total_per_tax[tax_rounding_key] = {
                        tax: tax,
                        is_reverse_charge: tax_data.is_reverse_charge,
                        currency: currency,
                        base_amount_currency: 0.0,
                        base_amount: 0.0,
                        raw_base_amount_currency: 0.0,
                        raw_base_amount: 0.0,
                        tax_amount_currency: 0.0,
                        tax_amount: 0.0,
                        raw_tax_amount_currency: 0.0,
                        raw_tax_amount: 0.0,
                        raw_total_amount_currency: 0.0,
                        raw_total_amount: 0.0,
                        base_lines: [],
                    };
                }

                const tax_amounts = total_per_tax[tax_rounding_key];
                tax_amounts.tax_amount_currency += tax_data.tax_amount_currency;
                tax_amounts.raw_tax_amount_currency += raw_tax_amount_currency;
                tax_amounts.tax_amount += tax_data.tax_amount;
                tax_amounts.raw_tax_amount += raw_tax_amount;
                tax_amounts.base_amount_currency += tax_data.base_amount_currency;
                tax_amounts.raw_base_amount_currency += raw_base_amount_currency;
                tax_amounts.base_amount += tax_data.base_amount;
                tax_amounts.raw_base_amount += raw_base_amount;
                tax_amounts.raw_total_amount_currency += raw_base_amount_currency + raw_tax_amount_currency;
                tax_amounts.raw_total_amount += raw_base_amount + raw_tax_amount;
                if (!base_line.special_type) {
                    tax_amounts.base_lines.push(base_line);
                }

                const base_rounding_key = [currency.id, base_line.is_refund];
                if (!(base_rounding_key in total_per_base)) {
                    total_per_base[base_rounding_key] = {
                        currency: currency,
                        tax_amount_currency: 0.0,
                        tax_amount: 0.0,
                        base_amount_currency: 0.0,
                        base_amount: 0.0,
                        raw_base_amount_currency: 0.0,
                        raw_base_amount: 0.0,
                        raw_total_amount_currency: 0.0,
                        raw_total_amount: 0.0,
                        base_lines: [],
                    };
                }
                const base_amounts = total_per_base[base_rounding_key];
                base_amounts.tax_amount_currency += tax_data.tax_amount_currency;
                base_amounts.tax_amount += tax_data.tax_amount;
                base_amounts.raw_total_amount_currency += raw_tax_amount_currency;
                base_amounts.raw_total_amount += raw_tax_amount;
                if (index === 0) {
                    base_amounts.base_amount_currency += tax_data.base_amount_currency;
                    base_amounts.raw_base_amount_currency += raw_base_amount_currency;
                    base_amounts.base_amount += tax_data.base_amount;
                    base_amounts.raw_base_amount += raw_base_amount;
                    base_amounts.raw_total_amount_currency += raw_base_amount_currency;
                    base_amounts.raw_total_amount += raw_base_amount;
                    if (!base_line.special_type) {
                        base_amounts.base_lines.push(base_line);
                    }
                }

                index++;
            }

            // If not, just account the base amounts.
            if(!taxes_data.length){
                tax_details.total_excluded_currency = roundPrecision(
                    tax_details.raw_total_excluded_currency,
                    currency.rounding
                );
                tax_details.total_excluded = roundPrecision(
                    tax_details.raw_total_excluded,
                    company.currency_id.rounding
                );

                const tax_rounding_key = [null, currency.id, base_line.is_refund, false];
                if (!(tax_rounding_key in total_per_tax)) {
                    total_per_tax[tax_rounding_key] = {
                        tax: null,
                        currency: currency,
                        base_amount_currency: 0.0,
                        base_amount: 0.0,
                        raw_base_amount_currency: 0.0,
                        raw_base_amount: 0.0,
                        tax_amount_currency: 0.0,
                        tax_amount: 0.0,
                        raw_tax_amount_currency: 0.0,
                        raw_tax_amount: 0.0,
                        raw_total_amount_currency: 0.0,
                        raw_total_amount: 0.0,
                        base_lines: []
                    };
                }
                const tax_amounts = total_per_tax[tax_rounding_key];
                tax_amounts.base_amount_currency += tax_details.total_excluded_currency;
                tax_amounts.raw_base_amount_currency += tax_details.raw_total_excluded_currency;
                tax_amounts.base_amount += tax_details.total_excluded;
                tax_amounts.raw_base_amount += tax_details.raw_total_excluded;
                tax_amounts.raw_total_amount_currency += tax_details.raw_total_excluded_currency;
                tax_amounts.raw_total_amount += tax_details.raw_total_excluded;
                if(!base_line.special_type){
                    tax_amounts.base_lines.push(base_line);
                }

                const base_rounding_key = [currency.id, base_line.is_refund];
                if (!(base_rounding_key in total_per_base)) {
                    total_per_base[base_rounding_key] = {
                        currency: currency,
                        tax_amount_currency: 0.0,
                        tax_amount: 0.0,
                        base_amount_currency: 0.0,
                        base_amount: 0.0,
                        raw_base_amount_currency: 0.0,
                        raw_base_amount: 0.0,
                        raw_total_amount_currency: 0.0,
                        raw_total_amount: 0.0,
                        base_lines: []
                    };
                }
                const base_amounts = total_per_base[base_rounding_key];
                base_amounts.base_amount_currency += tax_details.total_excluded_currency;
                base_amounts.raw_base_amount_currency += tax_details.raw_total_excluded_currency;
                base_amounts.base_amount += tax_details.total_excluded;
                base_amounts.raw_base_amount += tax_details.raw_total_excluded;
                base_amounts.raw_total_amount_currency += tax_details.raw_total_excluded_currency;
                base_amounts.raw_total_amount += tax_details.raw_total_excluded;
                if(!base_line.special_type){
                    base_amounts.base_lines.push(base_line);
                }
            }
        }

        // Round 'total_per_tax'.
        for (const tax_amounts of Object.values(total_per_tax)) {
            tax_amounts.raw_tax_amount_currency = roundPrecision(
                tax_amounts.raw_tax_amount_currency,
                tax_amounts.currency.rounding
            );
            tax_amounts.raw_tax_amount = roundPrecision(
                tax_amounts.raw_tax_amount,
                company.currency_id.rounding
            );
            tax_amounts.raw_base_amount_currency = roundPrecision(
                tax_amounts.raw_base_amount_currency,
                tax_amounts.currency.rounding
            );
            tax_amounts.raw_base_amount = roundPrecision(
                tax_amounts.raw_base_amount,
                company.currency_id.rounding
            );
            tax_amounts.raw_total_amount_currency = roundPrecision(
                tax_amounts.raw_total_amount_currency,
                tax_amounts.currency.rounding
            );
            tax_amounts.raw_total_amount = roundPrecision(
                tax_amounts.raw_total_amount,
                company.currency_id.rounding
            );
        }

        // Round 'total_per_base'.
        for (const base_amounts of Object.values(total_per_base)) {
            base_amounts.raw_base_amount_currency = roundPrecision(
                base_amounts.raw_base_amount_currency,
                base_amounts.currency.rounding
            );
            base_amounts.raw_base_amount = roundPrecision(
                base_amounts.raw_base_amount,
                company.currency_id.rounding
            );
            base_amounts.raw_total_amount_currency = roundPrecision(
                base_amounts.raw_total_amount_currency,
                base_amounts.currency.rounding
            );
            base_amounts.raw_total_amount = roundPrecision(
                base_amounts.raw_total_amount,
                company.currency_id.rounding
            );
        }

        // Dispatch the delta in term of tax amounts across the tax details when dealing with the 'round_globally' method.
        // Suppose 2 lines:
        // - quantity=12.12, price_unit=12.12, tax=23%
        // - quantity=12.12, price_unit=12.12, tax=23%
        // The tax of each line is computed as round(12.12 * 12.12 * 0.23) = 33.79
        // The expected tax amount of the whole document is round(12.12 * 12.12 * 0.23 * 2) = 67.57
        // The delta in term of tax amount is 67.57 - 33.79 - 33.79 = -0.01
        for (const tax_amounts of Object.values(total_per_tax)) {
            const is_reverse_charge = tax_amounts.is_reverse_charge;
            const currency = tax_amounts.currency;
            const tax = tax_amounts.tax;
            if (!tax_amounts.base_lines.length) {
                continue;
            }

            tax_amounts.sorted_base_line_x_tax_data = tax_amounts.base_lines
                .sort((base_line_1, base_line_2) => {
                    const key_1 = [
                        Boolean(base_line_1.special_type),
                        -base_line_1.tax_details.total_included_currency,
                    ];
                    const key_2 = [
                        Boolean(base_line_2.special_type),
                        -base_line_2.tax_details.total_included_currency,
                    ];

                    if (key_1[0] !== key_2[0]) {
                        return key_1[0] - key_2[0];
                    }
                    return key_1[1] - key_2[1];
                })
                .map(base_line => [
                    base_line,
                    base_line.tax_details.taxes_data.map((tax_data, index) => [index, tax_data]).find(
                        ([index, tax_data]) => tax_data.tax.id === tax.id && tax_data.is_reverse_charge === is_reverse_charge
                    ) || null
                ]);

            tax_amounts.total_included_currency = tax_amounts.base_lines.reduce(
                (sum, base_line) => sum + Math.abs(base_line.tax_details.total_included_currency),
                0
            );

            if (!tax || !tax_amounts.total_included_currency) {
                continue;
            }

            for (const [delta_field, delta_currency] of [
                ["tax_amount_currency", currency],
                ["tax_amount", company.currency_id],
            ]) {
                const delta_amount = tax_amounts[`raw_${delta_field}`] - tax_amounts[delta_field];
                const target_factors = tax_amounts.sorted_base_line_x_tax_data
                    .filter(([base_line, index_tax_data]) => index_tax_data)
                    .map(([base_line, index_tax_data]) => ({
                        factor: Math.abs(
                            base_line.tax_details.total_included_currency /
                                tax_amounts.total_included_currency
                        ),
                        base_line: base_line,
                        index_tax_data: index_tax_data,
                    }));
                const amounts_to_distribute = this.distribute_delta_amount_smoothly(
                    delta_currency.decimal_places,
                    delta_amount,
                    target_factors
                );
                for (let i = 0; i < target_factors.length; i++) {
                    const target_factor = target_factors[i];
                    const amount_to_distribute = amounts_to_distribute[i];

                    const base_line = target_factor.base_line;
                    const [index, tax_data] = target_factor.index_tax_data;
                    tax_data[delta_field] += amount_to_distribute;
                    tax_amounts[delta_field] += amount_to_distribute;

                    if (index === 0) {
                        const base_rounding_key = [currency.id, base_line.is_refund];
                        const base_amounts = total_per_base[base_rounding_key];
                        base_amounts[delta_field] += amount_to_distribute;
                    }
                }
            }
        }

        // Dispatch the delta of base amounts accross the base lines.
        // Suppose 2 lines:
        // - quantity=12.12, price_unit=12.12, tax=23%
        // - quantity=12.12, price_unit=12.12, tax=23%
        // The base amount of each line is computed as round(12.12 * 12.12) = 146.89
        // The expected base amount of the whole document is round(12.12 * 12.12 * 2) = 293.79
        // The delta in term of base amount is 293.79 - 146.89 - 146.89 = 0.01
        for (const tax_amounts of Object.values(total_per_tax)) {
            const currency = tax_amounts.currency;
            if (!tax_amounts.sorted_base_line_x_tax_data || !tax_amounts.total_included_currency) {
                continue;
            }

            for (const [delta_currency_indicator, delta_currency] of [
                ["_currency", currency],
                ["", company.currency_id],
            ]) {
                let delta_amount;
                if (country_code === "PT") {
                    delta_amount =
                        tax_amounts[`raw_total_amount${delta_currency_indicator}`] -
                        tax_amounts[`base_amount${delta_currency_indicator}`] -
                        tax_amounts[`tax_amount${delta_currency_indicator}`];
                } else {
                    delta_amount =
                        tax_amounts[`raw_base_amount${delta_currency_indicator}`] -
                        tax_amounts[`base_amount${delta_currency_indicator}`];
                }

                const target_factors = tax_amounts.sorted_base_line_x_tax_data.map(
                    ([base_line, index_tax_data]) => ({
                        factor: Math.abs(
                            base_line.tax_details.total_included_currency /
                                tax_amounts.total_included_currency
                        ),
                        base_line: base_line,
                        index_tax_data: index_tax_data,
                    })
                );
                const amounts_to_distribute = this.distribute_delta_amount_smoothly(
                    delta_currency.decimal_places,
                    delta_amount,
                    target_factors
                );
                for (let i = 0; i < target_factors.length; i++) {
                    const target_factor = target_factors[i];
                    const amount_to_distribute = amounts_to_distribute[i];

                    const base_line = target_factor.base_line;
                    const tax_details = base_line.tax_details;
                    const index_tax_data = target_factor.index_tax_data;
                    if (index_tax_data) {
                        const tax_data = index_tax_data[1];
                        tax_data[`base_amount${delta_currency_indicator}`] += amount_to_distribute;
                    } else {
                        tax_details[`delta_total_excluded${delta_currency_indicator}`] += amount_to_distribute;

                        const base_rounding_key = [currency.id, base_line.is_refund];
                        const base_amounts = total_per_base[base_rounding_key];
                        base_amounts[`base_amount${delta_currency_indicator}`] += amount_to_distribute;
                    }
                }
            }
        }

        // Dispatch the delta of base amounts accross the base lines.
        // Suppose 2 lines:
        // - quantity=12.12, price_unit=12.12, tax=23%
        // - quantity=12.12, price_unit=12.12, tax=13%
        // The base amount of each line is computed as round(12.12 * 12.12) = 146.89
        // The expected base amount of the whole document is round(12.12 * 12.12 * 2) = 293.79
        // Currently, the base amount has already been rounded per tax. So the tax details for the whole document is currently:
        // 23%: base = 146.89, tax = 33.79
        // 13%: base = 146.89, tax = 19.1
        // However, for the whole document, there is a delta in term of base amount: 293.79 - 146.89 - 146.89 = 0.01
        // This delta won't be there in any base but still has to be accounted.
        for (const base_amounts of Object.values(total_per_base)) {
            if (!base_amounts.base_lines.length) {
                continue;
            }

            let delta_base_amount_currency;
            let delta_base_amount;
            if (country_code === "PT") {
                delta_base_amount_currency = base_amounts.raw_total_amount_currency - base_amounts.base_amount_currency - base_amounts.tax_amount_currency;
                delta_base_amount = base_amounts.raw_total_amount - base_amounts.base_amount - base_amounts.tax_amount;
            } else {
                delta_base_amount_currency = base_amounts.raw_base_amount_currency - base_amounts.base_amount_currency;
                delta_base_amount = base_amounts.raw_base_amount - base_amounts.base_amount;
            }

            if (floatIsZero(delta_base_amount_currency, base_amounts.currency.decimal_places) && floatIsZero(delta_base_amount, company.currency_id.decimal_places)) {
                continue;
            }

            // Dispatch the base delta evenly on the base lines, starting from the biggest line.
            const factors = Array(base_amounts.base_lines.length).fill({ factor: 1.0 / base_amounts.base_lines.length });
            const base_lines_sorted = base_amounts.base_lines.sort((a, b) => 
                a.tax_details.total_included_currency - b.tax_details.total_included_currency
            );
            for (const [delta_currency_indicator, delta_currency, delta_amount] of [
                ["_currency", base_amounts.currency, delta_base_amount_currency],
                ["", company.currency_id, delta_base_amount],
            ]) {
                const amounts_to_distribute = this.distribute_delta_amount_smoothly(
                    delta_currency.decimal_places,
                    delta_amount,
                    factors,
                );

                for (const [i, base_line] of base_lines_sorted.entries()) {
                    base_line.tax_details[`delta_total_excluded${delta_currency_indicator}`] += amounts_to_distribute[i];
                }
            }
        }
    },

    // -------------------------------------------------------------------------
    // TAX TOTALS SUMMARY
    // -------------------------------------------------------------------------

    get_tax_totals_summary(base_lines, currency, company, {cash_rounding = null} = {}) {
        const company_pd = company.currency_id.rounding;
        const tax_totals_summary = {
            currency_id: currency.id,
            currency_pd: currency.rounding,
            company_currency_id: company.currency_id.id,
            company_currency_pd: company.currency_id.rounding,
            has_tax_groups: false,
            subtotals: [],
            base_amount_currency: 0.0,
            base_amount: 0.0,
            tax_amount_currency: 0.0,
            tax_amount: 0.0,
        };

        // Global tax values.
        const global_grouping_function = (base_line, tax_data) => tax_data !== null;

        let base_lines_aggregated_values = this.aggregate_base_lines_tax_details(base_lines, global_grouping_function);
        let values_per_grouping_key = this.aggregate_base_lines_aggregated_values(base_lines_aggregated_values);

        for (const values of Object.values(values_per_grouping_key)) {
            if (values.grouping_key) {
                tax_totals_summary.has_tax_groups = true;
            }
            tax_totals_summary.base_amount_currency += values.total_excluded_currency;
            tax_totals_summary.base_amount += values.total_excluded;
            tax_totals_summary.tax_amount_currency += values.tax_amount_currency;
            tax_totals_summary.tax_amount += values.tax_amount;
        }

        // Tax groups.
        const untaxed_amount_subtotal_label = _t("Untaxed Amount");
        const subtotals = {};

        const tax_group_grouping_function = (base_line, tax_data) => {
            if (!tax_data) {
                return;
            }
            return {
                grouping_key: tax_data.tax.tax_group_id.id,
                raw_grouping_key: tax_data.tax.tax_group_id,
            };
        }

        base_lines_aggregated_values = this.aggregate_base_lines_tax_details(base_lines, tax_group_grouping_function);
        values_per_grouping_key = this.aggregate_base_lines_aggregated_values(base_lines_aggregated_values);

        const sorted_total_per_tax_group = Object.values(values_per_grouping_key)
            .filter(values => values.grouping_key)
            .sort((a, b) => (a.grouping_key.sequence - b.grouping_key.sequence) || (a.grouping_key.id - b.grouping_key.id));

        const encountered_base_amounts = new Set();
        const subtotals_order = {};

        for (const [order, values] of sorted_total_per_tax_group.entries()) {
            const tax_group = values.grouping_key;

            // Get all involved taxes in the tax group.
            const involved_tax_ids = new Set();
            const involved_amount_types = new Set();
            const involved_price_include = new Set();
            values.base_line_x_taxes_data.forEach(([base_line, taxes_data]) => {
                taxes_data.forEach(tax_data => {
                    const tax = tax_data.tax;
                    involved_tax_ids.add(tax.id);
                    involved_amount_types.add(tax.amount_type);
                    involved_price_include.add(tax.price_include);
                });
            });

            // Compute the display base amounts.
            let display_base_amount = values.base_amount;
            let display_base_amount_currency = values.base_amount_currency;
            if (involved_amount_types.size === 1 && involved_amount_types.has("fixed")) {
                display_base_amount = null;
                display_base_amount_currency = null;
            } else if (
                involved_amount_types.size === 1
                && involved_amount_types.has("division")
                && involved_price_include.size === 1
                && involved_price_include.has(true)
            ) {
                values.base_line_x_taxes_data.forEach(([base_line, _taxes_data]) => {
                    base_line.tax_details.taxes_data.forEach(tax_data => {
                        if (tax_data.tax.amount_type === 'division') {
                            display_base_amount_currency += tax_data.tax_amount_currency;
                            display_base_amount += tax_data.tax_amount;
                        }
                    });
                });
            }

            if (display_base_amount_currency !== null) {
                encountered_base_amounts.add(parseFloat(display_base_amount_currency.toFixed(currency.decimal_places)));
            }

            // Order of the subtotals.
            const preceding_subtotal = tax_group.preceding_subtotal || untaxed_amount_subtotal_label;
            if (!(preceding_subtotal in subtotals)) {
                subtotals[preceding_subtotal] = {
                    tax_groups: [],
                    tax_amount_currency: 0.0,
                    tax_amount: 0.0,
                    base_amount_currency: 0.0,
                    base_amount: 0.0,
                };
            }
            if (!(preceding_subtotal in subtotals_order)) {
                subtotals_order[preceding_subtotal] = order;
            }

            subtotals[preceding_subtotal].tax_groups.push({
                id: tax_group.id,
                involved_tax_ids: Array.from(involved_tax_ids),
                tax_amount_currency: values.tax_amount_currency,
                tax_amount: values.tax_amount,
                base_amount_currency: values.base_amount_currency,
                base_amount: values.base_amount,
                display_base_amount_currency,
                display_base_amount,
                group_name: tax_group.name,
                group_label: tax_group.pos_receipt_label,
            });
        }

        // Subtotals.
        if (!Object.keys(subtotals).length) {
            subtotals[untaxed_amount_subtotal_label] = {
                tax_groups: [],
                tax_amount_currency: 0.0,
                tax_amount: 0.0,
                base_amount_currency: 0.0,
                base_amount: 0.0,
            };
        }

        const ordered_subtotals = Array.from(Object.entries(subtotals))
            .sort((a, b) => (subtotals_order[a[0]] || 0) - (subtotals_order[b[0]] || 0));
        let accumulated_tax_amount_currency = 0.0;
        let accumulated_tax_amount = 0.0;
        for (const [subtotal_label, subtotal] of ordered_subtotals) {
            subtotal.name = subtotal_label;
            subtotal.base_amount_currency = tax_totals_summary.base_amount_currency + accumulated_tax_amount_currency;
            subtotal.base_amount = tax_totals_summary.base_amount + accumulated_tax_amount;
            for (const tax_group of subtotal.tax_groups) {
                subtotal.tax_amount_currency += tax_group.tax_amount_currency;
                subtotal.tax_amount += tax_group.tax_amount;
                accumulated_tax_amount_currency += tax_group.tax_amount_currency;
                accumulated_tax_amount += tax_group.tax_amount;
            }
            tax_totals_summary.subtotals.push(subtotal);
        }

        // Cash rounding
        const cash_rounding_lines = base_lines.filter(base_line => base_line.special_type === 'cash_rounding');
        if (cash_rounding_lines.length) {
            tax_totals_summary.cash_rounding_base_amount_currency = 0.0;
            tax_totals_summary.cash_rounding_base_amount = 0.0;
            cash_rounding_lines.forEach(base_line => {
                const tax_details = base_line.tax_details;
                tax_totals_summary.cash_rounding_base_amount_currency += tax_details.total_excluded_currency;
                tax_totals_summary.cash_rounding_base_amount += tax_details.total_excluded;
            });
        } else if (cash_rounding !== null) {
            const strategy = cash_rounding.strategy;
            const cash_rounding_pd = cash_rounding.rounding;
            const cash_rounding_method = cash_rounding.rounding_method;
            const total_amount_currency = tax_totals_summary.base_amount_currency + tax_totals_summary.tax_amount_currency;
            const total_amount = tax_totals_summary.base_amount + tax_totals_summary.tax_amount;
            const expected_total_amount_currency = roundPrecision(total_amount_currency, cash_rounding_pd, cash_rounding_method);
            let cash_rounding_base_amount_currency = expected_total_amount_currency - total_amount_currency;
            const rate = total_amount ? Math.abs(total_amount_currency / total_amount) : 0.0;
            let cash_rounding_base_amount = rate ? roundPrecision(cash_rounding_base_amount_currency / rate, company_pd) : 0.0;
            if (!floatIsZero(cash_rounding_base_amount_currency, currency.decimal_places)) {
                if (strategy === 'add_invoice_line') {
                    tax_totals_summary.cash_rounding_base_amount_currency = cash_rounding_base_amount_currency;
                    tax_totals_summary.cash_rounding_base_amount = cash_rounding_base_amount;
                    tax_totals_summary.base_amount_currency += cash_rounding_base_amount_currency;
                    tax_totals_summary.base_amount += cash_rounding_base_amount;
                    subtotals[untaxed_amount_subtotal_label].base_amount_currency += cash_rounding_base_amount_currency;
                    subtotals[untaxed_amount_subtotal_label].base_amount += cash_rounding_base_amount;
                } else if (strategy === 'biggest_tax') {
                    const all_subtotal_tax_group = tax_totals_summary.subtotals
                        .flatMap(subtotal => subtotal.tax_groups.map(tax_group => [subtotal, tax_group]));

                    if (all_subtotal_tax_group.length) {
                        const [max_subtotal, max_tax_group] = all_subtotal_tax_group
                            .reduce((a, b) => (b[1].tax_amount_currency > a[1].tax_amount_currency ? b : a));

                        max_tax_group.tax_amount_currency += cash_rounding_base_amount_currency;
                        max_tax_group.tax_amount += cash_rounding_base_amount;
                        max_subtotal.tax_amount_currency += cash_rounding_base_amount_currency;
                        max_subtotal.tax_amount += cash_rounding_base_amount;
                        tax_totals_summary.tax_amount_currency += cash_rounding_base_amount_currency;
                        tax_totals_summary.tax_amount += cash_rounding_base_amount;
                    } else {
                        // Failed to apply the cash rounding since there is no tax.
                        cash_rounding_base_amount_currency = 0.0
                        cash_rounding_base_amount = 0.0
                    }
                }
            }
        }

        // Subtract the cash rounding from the untaxed amounts.
        const cash_rounding_base_amount_currency = tax_totals_summary.cash_rounding_base_amount_currency || 0.0;
        const cash_rounding_base_amount = tax_totals_summary.cash_rounding_base_amount || 0.0;
        tax_totals_summary.base_amount_currency -= cash_rounding_base_amount_currency;
        tax_totals_summary.base_amount -= cash_rounding_base_amount;
        for (const subtotal of tax_totals_summary.subtotals) {
            subtotal.base_amount_currency -= cash_rounding_base_amount_currency;
            subtotal.base_amount -= cash_rounding_base_amount;
        }
        encountered_base_amounts.add(parseFloat(tax_totals_summary.base_amount_currency.toFixed(currency.decimal_places)));
        tax_totals_summary.same_tax_base = encountered_base_amounts.size === 1;

        // Total amount.
        tax_totals_summary.total_amount_currency = tax_totals_summary.base_amount_currency + tax_totals_summary.tax_amount_currency + cash_rounding_base_amount_currency;
        tax_totals_summary.total_amount = tax_totals_summary.base_amount + tax_totals_summary.tax_amount + cash_rounding_base_amount;

        return tax_totals_summary;
    },

    // -------------------------------------------------------------------------
    // EDI HELPERS
    // -------------------------------------------------------------------------

    aggregate_base_line_tax_details(base_line, grouping_function) {
        const values_per_grouping_key = {};
        const tax_details = base_line.tax_details;
        const taxes_data = tax_details.taxes_data;

        // If there are no taxes, we pass an empty object to the grouping function.
        for (const tax_data of (taxes_data.length !== 0 ? taxes_data : [null])) {
            const generated_grouping_key = grouping_function(base_line, tax_data);
            let raw_grouping_key = generated_grouping_key;
            let grouping_key = generated_grouping_key;

            // There is no FrozenDict in javascript.
            // When the key is a record, it can't be jsonified so this is a trick to provide both the
            // raw_grouping_key (to be jsonified) from the grouping_key (to be added to the values).
            if (raw_grouping_key && typeof raw_grouping_key === "object" && "raw_grouping_key" in raw_grouping_key) {
                raw_grouping_key = generated_grouping_key.raw_grouping_key;
                grouping_key = generated_grouping_key.grouping_key;
            }

            // Handle dictionary-like keys (converted to string in JS)
            if (typeof grouping_key === 'object') {
                grouping_key = JSON.stringify(raw_grouping_key);
            }

            // Base amount
            if(!(grouping_key in values_per_grouping_key)){
                values_per_grouping_key[grouping_key] = {
                    tax_amount_currency: 0.0,
                    tax_amount: 0.0,
                    raw_tax_amount_currency: 0.0,
                    raw_tax_amount: 0.0,
                    total_excluded_currency: tax_details.total_excluded_currency + tax_details.delta_total_excluded_currency,
                    total_excluded: tax_details.total_excluded + tax_details.delta_total_excluded,
                    taxes_data: [],
                    grouping_key: raw_grouping_key
                };
                const values = values_per_grouping_key[grouping_key];

                if (tax_data) {
                    values.base_amount_currency = tax_data.base_amount_currency;
                    values.base_amount = tax_data.base_amount;
                    values.raw_base_amount_currency = tax_data.raw_base_amount_currency;
                    values.raw_base_amount = tax_data.raw_base_amount;
                } else {
                    values.base_amount_currency = tax_details.total_excluded_currency + tax_details.delta_total_excluded_currency;
                    values.base_amount = tax_details.total_excluded + tax_details.delta_total_excluded;
                    values.raw_base_amount_currency = tax_details.raw_total_excluded_currency;
                    values.raw_base_amount = tax_details.raw_total_excluded;
                }
            }
            const values = values_per_grouping_key[grouping_key];

            // Tax amount
            if (tax_data) {
                values.tax_amount_currency += tax_data.tax_amount_currency;
                values.tax_amount += tax_data.tax_amount;
                values.raw_tax_amount_currency += tax_data.raw_tax_amount_currency;
                values.raw_tax_amount += tax_data.raw_tax_amount;
                values.taxes_data.push(tax_data);
            }
        }

        return values_per_grouping_key;
    },

    aggregate_base_lines_tax_details(base_lines, grouping_function) {
        return base_lines.map(base_line => [base_line, this.aggregate_base_line_tax_details(base_line, grouping_function)]);
    },

    aggregate_base_lines_aggregated_values(base_lines_aggregated_values) {
        const default_float_fields = new Set([
            'base_amount_currency',
            'base_amount',
            'raw_base_amount_currency',
            'raw_base_amount',
            'tax_amount_currency',
            'tax_amount',
            'raw_tax_amount_currency',
            'raw_tax_amount',
            'total_excluded_currency',
            'total_excluded'
        ]);
        const values_per_grouping_key = {};
        for (const [base_line, aggregated_values] of base_lines_aggregated_values) {
            for (const [raw_grouping_key, values] of Object.entries(aggregated_values)) {
                const grouping_key = values.grouping_key;

                if(!(raw_grouping_key in values_per_grouping_key)){
                    const initial_values = values_per_grouping_key[raw_grouping_key] = {
                        base_line_x_taxes_data: [],
                        grouping_key: grouping_key,
                    };
                    default_float_fields.forEach(field => {
                        initial_values[field] = 0.0;
                    });
                }
                const agg_values = values_per_grouping_key[raw_grouping_key];
                default_float_fields.forEach(field => {
                    agg_values[field] += values[field];
                });
                agg_values.base_line_x_taxes_data.push([base_line, values.taxes_data]);
            }
        }

        return values_per_grouping_key;
    },

};
