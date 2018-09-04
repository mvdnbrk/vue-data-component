import { debounce } from '../util';
import createPagesArray from '../helpers/createPagesArray';
import { toQueryString } from '../helpers/queryString';

export const dataComponent = Symbol();

export default {
    name: 'DataComponent',

    props: {
        resource: { required: true, type: Function },
        query: { default: () => ({}) },
        initialData: { default: null, type: Object },
        debounceMs: { default: 0, type: Number },
        initialLoadDelayMs: { default: 0, type: Number },
        slowRequestThresholdMs: { default: 400, type: Number },
        dataKey: { default: 'data', type: String },
        tag: { default: 'div', type: String },
        queryString: { default: false, type: Boolean },
    },

    data: () => ({
        loaded: false,
        activeRequestCount: 0,
        isSlowRequest: false,

        visibleData: [],
        visibleCount: 0,
        totalCount: 0,
    }),

    provide() {
        return {
            [dataComponent]: {
                updateQuery: this.updateQuery,
                toggleSort: this.toggleSort,
            },
        };
    },

    created() {
        if (this.initialData) {
            this.hydrateWithInitialData();

            this.loaded = true;
        }

        const getVisibleData = this.debounceMs
            ? debounce(this.getVisibleData, this.debounceMs)
            : this.getVisibleData;

        this.$watch('query', getVisibleData, {
            deep: true,
            immediate: !this.loaded,
        });

        if (!this.initialLoadDelayMs) {
            this.loaded = true;
        }
    },

    mounted() {
        if (!this.loaded) {
            window.setTimeout(() => {
                this.loaded = true;
            }, this.initialLoadDelayMs);
        }

        this.$watch('activeRequestCount', this.handleActiveRequestCountChange);
    },

    methods: {
        getVisibleData({ forceUpdate = false } = {}) {
            if (this.queryString && this.loaded) {
                this.updateQueryString();
            }

            const result = this.resource({
                ...this.query,
                forceUpdate,
            });

            if (typeof result.then == 'function') {
                this.activeRequestCount++;

                result.then(
                    response => {
                        this.visibleData = response.data;
                        this.visibleCount = response.data.length;
                        this.totalCount = response.totalCount || response.data.length;

                        this.loaded = true;

                        this.activeRequestCount--;
                    },
                    () => {
                        this.activeRequestCount--;
                    }
                );
            } else if (result.hasOwnProperty('data')) {
                this.visibleData = result.data;
                this.visibleCount = result.data.length;
                this.totalCount = result.totalCount || result.data.length;

                this.loaded = true;
            } else {
                throw new Error('Fetcher must return a promise or an object with a `data` key');
            }
        },

        hydrateWithInitialData() {
            this.visibleData = this.initialData.data;
            this.visibleCount = this.initialData.data.length;
            this.totalCount = this.initialData.totalCount || this.initialData.data.length;
        },

        handleActiveRequestCountChange(activeRequestCount) {
            if (activeRequestCount === 0 && this.slowRequestTimeout) {
                window.clearTimeout(this.slowRequestTimeout);

                this.isSlowRequest = false;

                this.$emit('slowrequestend');
            }

            if (activeRequestCount === 1) {
                this.slowRequestTimeout = window.setTimeout(() => {
                    if (!this.isSlowRequest) {
                        this.isSlowRequest = true;

                        this.$emit('slowrequeststart');
                    }
                }, this.slowRequestThresholdMs);
            }
        },

        updateQuery(query) {
            this.$emit('update:query', { ...this.query, ...query });
        },

        toggleSort(field) {
            if (!this.query.sort) {
                this.updateQuery({ sort: field });

                return;
            }

            const currentSortOrder = this.query.sort.charAt(0) === '-' ? 'desc' : 'asc';
            const currentSortField =
                currentSortOrder === 'desc' ? this.query.sort.slice(1) : this.query.sort;

            if (field === currentSortField && currentSortOrder === 'asc') {
                this.updateQuery({ sort: `-${currentSortField}` });

                return;
            }

            this.updateQuery({ sort: field });
        },

        updateQueryString() {
            window.history.replaceState(
                null,
                null,
                window.location.pathname + toQueryString(this.query)
            );
        },

        forceUpdate() {
            this.getVisibleData({ forceUpdate: true });
        },
    },

    render(createElement) {
        if (!this.loaded) {
            return null;
        }

        return createElement(
            this.tag,
            {},
            this.$scopedSlots.default({
                [this.dataKey]: this.visibleData,
                visibleCount: this.visibleCount,
                totalCount: this.totalCount,
                isSlowRequest: this.isSlowRequest,
                toggleSort: this.toggleSort,
                updateQuery: this.updateQuery,
                reset: this.reset,
                pages: createPagesArray({
                    page: this.query.page,
                    perPage: this.query.perPage,
                    totalCount: this.totalCount,
                }),
            })
        );
    },
};
