@autocomplete @onFocusOut @selections-input @need-review
Feature: Autocomplete - onFocusOut callback must not fire when interacting within the dropdown
  As a product team developer
  I want the onFocusOut callback to not be triggered when clicking elements inside the Autocomplete dropdown
  So that users can interact with dropdown content without unexpectedly triggering focus-out side effects

  Background: Navigate to Autocomplete component in Storybook
    Given I have accessed Storybook successfully
    And I navigate to the "Selections & Input" section
    And I select "Autocomplete" component at the sidebar
    And I select "README" tab at the sidebar
    And I click on tab "Examples" of "Autocomplete" component at the sidebar

  # ─── Happy path: onFocusOut is NOT triggered during internal dropdown interactions ───

  @xray-ONEDS-14043
  Scenario: onFocusOut is not triggered when clicking an available option in the dropdown
    Given I have accessed "Playground" of "Autocomplete" successfully
    And the "onFocusOut" prop is configured with a callback spy
    And I click on the Autocomplete input to open the dropdown
    When I click on an available option in the dropdown
    Then the "onFocusOut" callback should not have been called

  @xray-ONEDS-14044
  Scenario: onFocusOut is not triggered when clicking a disabled option in the dropdown
    Given I have accessed "Playground" of "Autocomplete" successfully
    And the "onFocusOut" prop is configured with a callback spy
    And at least one option in the dropdown is in a disabled state
    And I click on the Autocomplete input to open the dropdown
    When I click on a disabled option in the dropdown
    Then the "onFocusOut" callback should not have been called

  @xray-ONEDS-14049
  Scenario: onFocusOut is not triggered when clicking a group label in the dropdown
    Given I have accessed "Grouping" example of "Autocomplete" successfully
    And the "onFocusOut" prop is configured with a callback spy
    And I click on the Autocomplete input to open the dropdown
    When I click on a group label header within the dropdown
    Then the "onFocusOut" callback should not have been called
    And the dropdown should remain open

  @xray-ONEDS-14040
  Scenario: onFocusOut is not triggered when the dropdown shows an empty state
    Given I have accessed "EmptyOption" example of "Autocomplete" successfully
    And the "onFocusOut" prop is configured with a callback spy
    And I click on the Autocomplete input to open the dropdown
    And I click on the empty state area inside the dropdown
    Then the "onFocusOut" callback should not have been called

  @xray-ONEDS-14041
  Scenario: onFocusOut is not triggered when clicking the dropdown scrollbar or container area
    Given I have accessed "DropdownConfigInnerPadding" example of "Autocomplete" successfully
    And the "onFocusOut" prop is configured with a callback spy
    And the dropdown list contains enough options to require scrolling
    And I click on the Autocomplete input to open the dropdown
    When I click on the dropdown container area (not on an option)
    Then the "onFocusOut" callback should not have been called
